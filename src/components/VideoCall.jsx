import { useEffect, useRef, useState } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import socket from '../services/socket'

const APP_ID = '122cced8c4204f7084f9d0078f92b1fb'

const FILTERS = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'grayscale', label: 'B&N', css: 'grayscale(100%)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(100%)' },
  { id: 'brightness', label: 'Brillo', css: 'brightness(1.4)' },
  { id: 'contrast', label: 'Contraste', css: 'contrast(1.8)' },
]

const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

export default function VideoCall({ call, user, onEnd }) {
  const { contact, callType: initialCallType, isIncoming, remoteUserId, channelName } = call

  const ringtoneRef = useRef(null)
  const localVideoRef = useRef()
  const remoteVideoRefs = useRef({})
  const localTracksRef = useRef({ audio: null, video: null })

  const [callType, setCallType] = useState(initialCallType)
  const [status, setStatus] = useState(isIncoming ? 'incoming' : 'calling')
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [activeFilter, setActiveFilter] = useState('none')
  const [callDuration, setCallDuration] = useState(0)
  const [remoteUsers, setRemoteUsers] = useState([])
  const [upgradeRequested, setUpgradeRequested] = useState(false)

  // Generar nombre de canal único para la llamada
  const channel = channelName || `call_${[user.id, remoteUserId].sort().join('_')}`

  // Ringtone
  useEffect(() => {
    if (status === 'incoming') {
      const audio = new Audio('/ringtone.mp3')
      audio.loop = true
      audio.play().catch(() => {})
      ringtoneRef.current = audio
    }
    return () => { ringtoneRef.current?.pause(); ringtoneRef.current = null }
  }, [status])

  // Timer
  useEffect(() => {
    if (status !== 'active') return
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [status])

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // Unirse al canal de Agora
  const joinChannel = async (withVideo = false) => {
    try {
      await client.join(APP_ID, channel, null, user.id)

      const tracks = []
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      localTracksRef.current.audio = audioTrack
      tracks.push(audioTrack)

      if (withVideo) {
        const videoTrack = await AgoraRTC.createCameraVideoTrack()
        localTracksRef.current.video = videoTrack
        tracks.push(videoTrack)
        videoTrack.play(localVideoRef.current)
      }

      await client.publish(tracks)
      setStatus('active')
    } catch (err) {
      console.error('Error uniéndose al canal:', err)
      alert('Error al iniciar la llamada. Verifica los permisos de micrófono/cámara.')
    }
  }

  // Manejar usuarios remotos
  useEffect(() => {
    const handleUserPublished = async (agoraUser, mediaType) => {
      await client.subscribe(agoraUser, mediaType)
      
      if (mediaType === 'video') {
        setRemoteUsers(prev => {
          if (!prev.find(u => u.uid === agoraUser.uid)) {
            return [...prev, agoraUser]
          }
          return prev
        })
        setTimeout(() => {
          const container = document.getElementById(`remote-video-${agoraUser.uid}`)
          if (container) agoraUser.videoTrack?.play(container)
        }, 100)
      }
      
      if (mediaType === 'audio') {
        agoraUser.audioTrack?.play()
      }
    }

    const handleUserUnpublished = (agoraUser) => {
      setRemoteUsers(prev => prev.filter(u => u.uid !== agoraUser.uid))
    }

    const handleUserLeft = (agoraUser) => {
      setRemoteUsers(prev => prev.filter(u => u.uid !== agoraUser.uid))
    }

    client.on('user-published', handleUserPublished)
    client.on('user-unpublished', handleUserUnpublished)
    client.on('user-left', handleUserLeft)

    return () => {
      client.off('user-published', handleUserPublished)
      client.off('user-unpublished', handleUserUnpublished)
      client.off('user-left', handleUserLeft)
    }
  }, [])

  // Eventos Socket
  useEffect(() => {
    socket.on('call:accepted', async ({ callType: ct }) => {
      setCallType(ct)
      await joinChannel(ct === 'video')
    })

    socket.on('call:ended', () => { cleanup(); onEnd() })
    socket.on('call:rejected', () => { cleanup(); onEnd() })
    
    socket.on('call:upgrade', async () => {
      setUpgradeRequested(true)
      setCallType('video')
      if (!localTracksRef.current.video) {
        const videoTrack = await AgoraRTC.createCameraVideoTrack()
        localTracksRef.current.video = videoTrack
        videoTrack.play(localVideoRef.current)
        await client.publish([videoTrack])
      }
    })

    return () => {
      socket.off('call:accepted')
      socket.off('call:ended')
      socket.off('call:rejected')
      socket.off('call:upgrade')
    }
  }, [])

  // Llamada saliente — avisar al otro
  useEffect(() => {
    if (!isIncoming) {
      socket.emit('call:start', {
        toUserId: remoteUserId,
        fromUserId: user.id,
        fromName: user.name,
        fromAvatar: user.avatar_url,
        callType,
        channelName: channel
      })
    }
  }, [])

  // Limpiar al desmontar
  useEffect(() => { return cleanup }, [])

  const cleanup = async () => {
    localTracksRef.current.audio?.close()
    localTracksRef.current.video?.close()
    try { await client.leave() } catch {}
  }

  const acceptCall = async () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    socket.emit('call:accept', { toUserId: remoteUserId, callType })
    await joinChannel(callType === 'video')
  }

  const rejectCall = () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    socket.emit('call:reject', { toUserId: remoteUserId })
    onEnd()
  }

  const endCall = async () => {
    socket.emit('call:end', { toUserId: remoteUserId })
    await cleanup()
    onEnd()
  }

  const toggleMute = () => {
    const audio = localTracksRef.current.audio
    if (audio) { audio.setEnabled(!audio.enabled); setIsMuted(m => !m) }
  }

  const toggleCamera = () => {
    const video = localTracksRef.current.video
    if (video) { video.setEnabled(!video.enabled); setIsCameraOff(c => !c) }
  }

  const upgradeToVideo = async () => {
    socket.emit('call:upgrade', { toUserId: remoteUserId })
    setCallType('video')
    if (!localTracksRef.current.video) {
      const videoTrack = await AgoraRTC.createCameraVideoTrack()
      localTracksRef.current.video = videoTrack
      videoTrack.play(localVideoRef.current)
      await client.publish([videoTrack])
    }
  }

  const applyFilter = (filterId) => {
    setActiveFilter(filterId)
    const filter = FILTERS.find(f => f.id === filterId)
    if (localVideoRef.current) localVideoRef.current.style.filter = filter.css
  }

  const avatarBg = contact?.color || '#3b82f6'
  const initials = contact?.name?.substring(0, 2).toUpperCase() || '??'
  const isVideo = callType === 'video'
  const isActive = status === 'active'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

      {/* Videos remotos */}
      {isActive && isVideo && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexWrap: 'wrap' }}>
          {remoteUsers.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', opacity: 0.5 }}>
              Esperando video...
            </div>
          )}
          {remoteUsers.map(u => (
            <div key={u.uid} id={`remote-video-${u.uid}`}
              style={{ flex: 1, minWidth: '50%', minHeight: remoteUsers.length > 1 ? '50%' : '100%', background: '#1e293b' }} />
          ))}
        </div>
      )}

      {/* Video local (esquina) */}
      {isActive && isVideo && (
        <div ref={localVideoRef}
          style={{ position: 'absolute', bottom: 100, right: 16, width: 100, height: 140, borderRadius: 12, border: '2px solid white', overflow: 'hidden', background: '#1e293b', zIndex: 10 }} />
      )}

      {/* Pantalla entrante */}
      {status === 'incoming' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>{isVideo ? '📹 Videollamada entrante' : '📞 Llamada entrante'}</p>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'white', margin: '0 auto 16px', overflow: 'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : initials}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
          <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
            <button onClick={rejectCall} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>❌</button>
            <button onClick={acceptCall} style={{ width: 64, height: 64, borderRadius: '50%', background: '#22c55e', border: 'none', fontSize: 24, cursor: 'pointer' }}>✅</button>
          </div>
        </div>
      )}

      {/* Pantalla llamando */}
      {status === 'calling' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'white', margin: '0 auto 16px', overflow: 'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : initials}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity: 0.6, fontSize: 14, animation: 'pulse 1.5s infinite' }}>Llamando...</p>
          <button onClick={endCall} style={{ marginTop: 40, width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>🔴</button>
        </div>
      )}

      {/* Pantalla activa */}
      {isActive && (
        <>
          {!isVideo && (
            <div style={{ textAlign: 'center', color: 'white', marginBottom: 40 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'white', margin: '0 auto 16px', overflow: 'hidden' }}>
                {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : initials}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
              <p style={{ opacity: 0.7, fontSize: 14 }}>{formatTime(callDuration)}</p>
            </div>
          )}

          {isVideo && (
            <div style={{ position: 'absolute', top: 16, left: 16, color: 'white', fontSize: 14, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 20, zIndex: 10 }}>
              {formatTime(callDuration)}
            </div>
          )}

          {upgradeRequested && !isVideo && (
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 20px', marginBottom: 20, textAlign: 'center', color: 'white' }}>
              <p style={{ fontSize: 13, marginBottom: 8 }}>{contact?.name} quiere activar el video</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => { setUpgradeRequested(false); upgradeToVideo() }} style={{ background: '#22c55e', border: 'none', color: 'white', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>Aceptar</button>
                <button onClick={() => setUpgradeRequested(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>Rechazar</button>
              </div>
            </div>
          )}

          {showFilters && isVideo && (
            <div style={{ position: 'absolute', bottom: 160, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 12, zIndex: 10 }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => applyFilter(f.id)} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, background: activeFilter === f.id ? '#3b82f6' : 'rgba(255,255,255,0.2)', color: 'white' }}>{f.label}</button>
              ))}
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 40, display: 'flex', gap: 16, alignItems: 'center', zIndex: 10 }}>
            <button onClick={toggleMute} style={{ width: 52, height: 52, borderRadius: '50%', background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }}>
              {isMuted ? '🔇' : '🎤'}
            </button>
            {isVideo && (
              <button onClick={toggleCamera} style={{ width: 52, height: 52, borderRadius: '50%', background: isCameraOff ? '#ef4444' : 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }}>
                {isCameraOff ? '📵' : '📷'}
              </button>
            )}
            {isVideo && (
              <button onClick={() => setShowFilters(f => !f)} style={{ width: 52, height: 52, borderRadius: '50%', background: showFilters ? '#3b82f6' : 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }}>
                🎨
              </button>
            )}
            {!isVideo && (
              <button onClick={upgradeToVideo} style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }} title="Activar video">
                📹
              </button>
            )}
            <button onClick={endCall} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>
              📵
            </button>
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
    </div>
  )
}