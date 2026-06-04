import { useEffect, useRef, useState } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import socket from '../services/socket'
import api from '../services/api'

const APP_ID = 'f2dd146790964084b021e633d8a17b67'

const FILTERS = [
  { id: 'none',       label: 'Normal',    css: 'none' },
  { id: 'grayscale',  label: 'B&N',       css: 'grayscale(100%)' },
  { id: 'sepia',      label: 'Sepia',     css: 'sepia(100%)' },
  { id: 'brightness', label: 'Brillo',    css: 'brightness(1.4)' },
  { id: 'contrast',   label: 'Contraste', css: 'contrast(1.8)' },
]

// Convierte UUID a número <= 99999 (igual que el backend)
function hashUid(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash) % 100000
}

// Nombre de canal seguro: sin guiones, máx 64 chars
function safeChannel(raw) {
  return raw.replace(/-/g, '').substring(0, 64)
}

// Pide token al backend
async function fetchToken(channelName, uid) {
  const res = await api.post('/agora/token', { channelName, uid })
  return res.data // { token, uid }
}

// ─────────────────────────────────────────────
//  Llamada 1 a 1
// ─────────────────────────────────────────────
export default function VideoCall({ call, user, onEnd }) {
  const { contact, callType: initialCallType, isIncoming, remoteUserId, channelName } = call

  const clientRef       = useRef(null)
  const ringtoneRef     = useRef(null)
  const localVideoRef   = useRef()
  const localTracksRef  = useRef({ audio: null, video: null })
  const numericUid      = useRef(hashUid(String(user.id)))

  const [callType,          setCallType]          = useState(initialCallType)
  const [status,            setStatus]            = useState(isIncoming ? 'incoming' : 'calling')
  const [isMuted,           setIsMuted]           = useState(false)
  const [isCameraOff,       setIsCameraOff]       = useState(false)
  const [showFilters,       setShowFilters]       = useState(false)
  const [activeFilter,      setActiveFilter]      = useState('none')
  const [callDuration,      setCallDuration]      = useState(0)
  const [remoteUsers,       setRemoteUsers]       = useState([])
  const [upgradeRequested,  setUpgradeRequested]  = useState(false)

  const rawChannel = channelName || `call_${[user.id, remoteUserId].sort().join('_')}`
  const channel    = safeChannel(rawChannel)

  useEffect(() => {
    clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    return () => { cleanup() }
  }, [])

  // Ringtone
  useEffect(() => {
    if (status !== 'incoming') return
    const audio = new Audio('/ringtone.mp3')
    audio.loop = true
    audio.play().catch(() => {})
    ringtoneRef.current = audio
    return () => { ringtoneRef.current?.pause(); ringtoneRef.current = null }
  }, [status])

  // Timer
  useEffect(() => {
    if (status !== 'active') return
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [status])

  const formatTime = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const joinChannel = async (withVideo = false) => {
    try {
      const client = clientRef.current
      // Pedir token al backend
      const { token, uid } = await fetchToken(channel, user.id)
      numericUid.current = uid

      await client.join(APP_ID, channel, token, uid)

      const tracks = []
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      localTracksRef.current.audio = audioTrack
      tracks.push(audioTrack)

      if (withVideo) {
        const videoTrack = await AgoraRTC.createCameraVideoTrack()
        localTracksRef.current.video = videoTrack
        tracks.push(videoTrack)
      }

      await client.publish(tracks)
      setStatus('active')
      // Reproducir video local DESPUÉS de que React renderice el div
      if (withVideo) {
        setTimeout(() => {
          if (localVideoRef.current && localTracksRef.current.video) {
            localTracksRef.current.video.play(localVideoRef.current)
          }
        }, 300)
      }
    } catch (err) {
      console.error('Error uniéndose al canal:', err)
      alert('Error al iniciar la llamada. Verifica los permisos de micrófono/cámara.')
    }
  }

  // Usuarios remotos
  useEffect(() => {
    const client = clientRef.current
    if (!client) return

    const playRemoteVideo = (agoraUser, attempt = 0) => {
      const el = document.getElementById(`remote-video-${agoraUser.uid}`)
      if (el) {
        agoraUser.videoTrack?.play(el)
      } else if (attempt < 10) {
        setTimeout(() => playRemoteVideo(agoraUser, attempt + 1), 200)
      }
    }

    const onPublished = async (agoraUser, mediaType) => {
      await client.subscribe(agoraUser, mediaType)
      if (mediaType === 'video') {
        setRemoteUsers(prev =>
          prev.find(u => u.uid === agoraUser.uid) ? prev : [...prev, agoraUser]
        )
        // Retry hasta 10 veces cada 200ms esperando que React renderice el div
        setTimeout(() => playRemoteVideo(agoraUser), 100)
      }
      if (mediaType === 'audio') agoraUser.audioTrack?.play()
    }
    const onUnpublished = u => setRemoteUsers(prev => prev.filter(x => x.uid !== u.uid))
    const onLeft        = u => setRemoteUsers(prev => prev.filter(x => x.uid !== u.uid))

    client.on('user-published',   onPublished)
    client.on('user-unpublished', onUnpublished)
    client.on('user-left',        onLeft)
    return () => {
      client.off('user-published',   onPublished)
      client.off('user-unpublished', onUnpublished)
      client.off('user-left',        onLeft)
    }
  }, [])

  // Eventos Socket
  useEffect(() => {
    const onAccepted = async ({ callType: ct }) => {
      setCallType(ct)
      await joinChannel(ct === 'video')
    }
    const onEnded    = () => { cleanup(); onEnd() }
    const onRejected = () => { cleanup(); onEnd() }
    const onUpgrade  = async () => {
      setUpgradeRequested(true)
      setCallType('video')
      if (!localTracksRef.current.video) {
        const vt = await AgoraRTC.createCameraVideoTrack()
        localTracksRef.current.video = vt
        vt.play(localVideoRef.current)
        await clientRef.current.publish([vt])
      }
    }

    socket.on('call:accepted', onAccepted)
    socket.on('call:ended',    onEnded)
    socket.on('call:rejected', onRejected)
    socket.on('call:upgrade',  onUpgrade)
    return () => {
      socket.off('call:accepted', onAccepted)
      socket.off('call:ended',    onEnded)
      socket.off('call:rejected', onRejected)
      socket.off('call:upgrade',  onUpgrade)
    }
  }, [])

  // Llamada saliente
  useEffect(() => {
    if (!isIncoming) {
      socket.emit('call:start', {
        toUserId:   remoteUserId,
        fromUserId: user.id,
        fromName:   user.name,
        fromAvatar: user.avatar_url,
        callType,
        channelName: channel,
      })
    }
  }, [])

  const cleanup = async () => {
    localTracksRef.current.audio?.close()
    localTracksRef.current.video?.close()
    localTracksRef.current = { audio: null, video: null }
    try { if (clientRef.current) await clientRef.current.leave() } catch {}
  }

  const acceptCall    = async () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    socket.emit('call:accept', { toUserId: remoteUserId, callType })
    await joinChannel(callType === 'video')
  }
  const rejectCall    = () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    socket.emit('call:reject', { toUserId: remoteUserId })
    onEnd()
  }
  const endCall       = async () => {
    socket.emit('call:end', { toUserId: remoteUserId })
    await cleanup(); onEnd()
  }
  const toggleMute    = () => {
    const a = localTracksRef.current.audio
    if (a) { a.setEnabled(!a.enabled); setIsMuted(m => !m) }
  }
  const toggleCamera  = () => {
    const v = localTracksRef.current.video
    if (v) { v.setEnabled(!v.enabled); setIsCameraOff(c => !c) }
  }
  const upgradeToVideo = async () => {
    socket.emit('call:upgrade', { toUserId: remoteUserId })
    setCallType('video')
    if (!localTracksRef.current.video) {
      const vt = await AgoraRTC.createCameraVideoTrack()
      localTracksRef.current.video = vt
      vt.play(localVideoRef.current)
      await clientRef.current.publish([vt])
    }
  }
  const applyFilter = (filterId) => {
    setActiveFilter(filterId)
    const f = FILTERS.find(f => f.id === filterId)
    if (localVideoRef.current) localVideoRef.current.style.filter = f.css
  }

  const avatarBg = contact?.color || '#3b82f6'
  const initials  = contact?.name?.substring(0, 2).toUpperCase() || '??'
  const isVideo   = callType === 'video'
  const isActive  = status === 'active'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>

      {isActive && isVideo && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexWrap:'wrap' }}>
          {remoteUsers.length === 0 && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'white', opacity:0.5 }}>
              Esperando video...
            </div>
          )}
          {remoteUsers.map(u => (
            <div key={u.uid} id={`remote-video-${u.uid}`}
              style={{ flex:1, minWidth:'50%', minHeight: remoteUsers.length > 1 ? '50%' : '100%', background:'#1e293b' }} />
          ))}
        </div>
      )}

      {isActive && isVideo && (
        <div ref={localVideoRef}
          style={{ position:'absolute', bottom:100, right:16, width:100, height:140, borderRadius:12, border:'2px solid white', overflow:'hidden', background:'#1e293b', zIndex:10 }} />
      )}

      {status === 'incoming' && (
        <div style={{ textAlign:'center', color:'white' }}>
          <p style={{ fontSize:14, opacity:0.7, marginBottom:16 }}>{isVideo ? '📹 Videollamada entrante' : '📞 Llamada entrante'}</p>
          <div style={{ width:80, height:80, borderRadius:'50%', background:avatarBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:600, color:'white', margin:'0 auto 16px', overflow:'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : initials}
          </div>
          <h2 style={{ fontSize:24, fontWeight:600, margin:'0 0 8px' }}>{contact?.name}</h2>
          <div style={{ display:'flex', gap:24, marginTop:40, justifyContent:'center' }}>
            <button onClick={rejectCall} style={{ width:64, height:64, borderRadius:'50%', background:'#ef4444', border:'none', fontSize:24, cursor:'pointer' }}>❌</button>
            <button onClick={acceptCall} style={{ width:64, height:64, borderRadius:'50%', background:'#22c55e', border:'none', fontSize:24, cursor:'pointer' }}>✅</button>
          </div>
        </div>
      )}

      {status === 'calling' && (
        <div style={{ textAlign:'center', color:'white' }}>
          <div style={{ width:80, height:80, borderRadius:'50%', background:avatarBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:600, color:'white', margin:'0 auto 16px', overflow:'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : initials}
          </div>
          <h2 style={{ fontSize:24, fontWeight:600, margin:'0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity:0.6, fontSize:14, animation:'pulse 1.5s infinite' }}>Llamando...</p>
          <button onClick={endCall} style={{ marginTop:40, width:64, height:64, borderRadius:'50%', background:'#ef4444', border:'none', fontSize:24, cursor:'pointer' }}>🔴</button>
        </div>
      )}

      {isActive && (
        <>
          {!isVideo && (
            <div style={{ textAlign:'center', color:'white', marginBottom:40 }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:avatarBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:600, color:'white', margin:'0 auto 16px', overflow:'hidden' }}>
                {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : initials}
              </div>
              <h2 style={{ fontSize:22, fontWeight:600, margin:'0 0 8px' }}>{contact?.name}</h2>
              <p style={{ opacity:0.7, fontSize:14 }}>{formatTime(callDuration)}</p>
            </div>
          )}
          {isVideo && (
            <div style={{ position:'absolute', top:16, left:16, color:'white', fontSize:14, background:'rgba(0,0,0,0.5)', padding:'4px 12px', borderRadius:20, zIndex:10 }}>
              {formatTime(callDuration)}
            </div>
          )}
          {upgradeRequested && !isVideo && (
            <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:12, padding:'12px 20px', marginBottom:20, textAlign:'center', color:'white' }}>
              <p style={{ fontSize:13, marginBottom:8 }}>{contact?.name} quiere activar el video</p>
              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                <button onClick={() => { setUpgradeRequested(false); upgradeToVideo() }} style={{ background:'#22c55e', border:'none', color:'white', padding:'6px 16px', borderRadius:20, cursor:'pointer', fontSize:13 }}>Aceptar</button>
                <button onClick={() => setUpgradeRequested(false)} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white', padding:'6px 16px', borderRadius:20, cursor:'pointer', fontSize:13 }}>Rechazar</button>
              </div>
            </div>
          )}
          {showFilters && isVideo && (
            <div style={{ position:'absolute', bottom:160, display:'flex', gap:8, background:'rgba(0,0,0,0.6)', padding:'8px 12px', borderRadius:12, zIndex:10 }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => applyFilter(f.id)}
                  style={{ padding:'4px 12px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, background: activeFilter === f.id ? '#3b82f6' : 'rgba(255,255,255,0.2)', color:'white' }}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ position:'absolute', bottom:40, display:'flex', gap:16, alignItems:'center', zIndex:10 }}>
            <button onClick={toggleMute} style={{ width:52, height:52, borderRadius:'50%', background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.2)', border:'none', fontSize:20, cursor:'pointer' }}>
              {isMuted ? '🔇' : '🎤'}
            </button>
            {isVideo && <button onClick={toggleCamera} style={{ width:52, height:52, borderRadius:'50%', background: isCameraOff ? '#ef4444' : 'rgba(255,255,255,0.2)', border:'none', fontSize:20, cursor:'pointer' }}>{isCameraOff ? '📵' : '📷'}</button>}
            {isVideo && <button onClick={() => setShowFilters(f => !f)} style={{ width:52, height:52, borderRadius:'50%', background: showFilters ? '#3b82f6' : 'rgba(255,255,255,0.2)', border:'none', fontSize:20, cursor:'pointer' }}>🎨</button>}
            {!isVideo && <button onClick={upgradeToVideo} style={{ width:52, height:52, borderRadius:'50%', background:'rgba(255,255,255,0.2)', border:'none', fontSize:20, cursor:'pointer' }}>📹</button>}
            <button onClick={endCall} style={{ width:64, height:64, borderRadius:'50%', background:'#ef4444', border:'none', fontSize:24, cursor:'pointer' }}>📵</button>
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
    </div>
  )
}

// ─────────────────────────────────────────────
//  Llamada Grupal
// ─────────────────────────────────────────────
export function GroupVideoCall({ call, user, onEnd }) {
  const { contact, callType: initialCallType, isIncoming, remoteUserIds = [], conversationId } = call

  const rawChannel = `group${conversationId}`
  const channel    = safeChannel(rawChannel)

  const clientRef      = useRef(null)
  const ringtoneRef    = useRef(null)
  const localVideoRef  = useRef()
  const localTracksRef = useRef({ audio: null, video: null })

  const [callType,     setCallType]     = useState(initialCallType)
  const [status,       setStatus]       = useState(isIncoming ? 'incoming' : 'calling')
  const [isMuted,      setIsMuted]      = useState(false)
  const [isCameraOff,  setIsCameraOff]  = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [remoteUsers,  setRemoteUsers]  = useState([])

  useEffect(() => {
    clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    return () => { cleanup() }
  }, [])

  useEffect(() => {
    if (status !== 'incoming') return
    const audio = new Audio('/ringtone.mp3')
    audio.loop = true
    audio.play().catch(() => {})
    ringtoneRef.current = audio
    return () => { ringtoneRef.current?.pause(); ringtoneRef.current = null }
  }, [status])

  useEffect(() => {
    if (status !== 'active') return
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [status])

  const formatTime = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const joinChannel = async (withVideo = false) => {
    try {
      const client = clientRef.current
      const { token, uid } = await fetchToken(channel, user.id)

      await client.join(APP_ID, channel, token, uid)

      const tracks = []
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      localTracksRef.current.audio = audioTrack
      tracks.push(audioTrack)

      if (withVideo) {
        const videoTrack = await AgoraRTC.createCameraVideoTrack()
        localTracksRef.current.video = videoTrack
        tracks.push(videoTrack)
      }

      await client.publish(tracks)
      setStatus('active')
      if (withVideo) {
        setTimeout(() => {
          if (localVideoRef.current && localTracksRef.current.video) {
            localTracksRef.current.video.play(localVideoRef.current)
          }
        }, 300)
      }

      socket.emit('call:group_join', {
        toUserIds: remoteUserIds,
        fromUserId: user.id,
        callType: withVideo ? 'video' : 'audio',
      })
    } catch (err) {
      console.error('Error uniéndose al canal grupal:', err)
      alert('Error al iniciar la llamada grupal. Verifica los permisos de micrófono/cámara.')
    }
  }

  useEffect(() => {
    const client = clientRef.current
    if (!client) return

    const playGrpVideo = (agoraUser, attempt = 0) => {
      const el = document.getElementById(`grp-remote-${agoraUser.uid}`)
      if (el) { agoraUser.videoTrack?.play(el) }
      else if (attempt < 10) { setTimeout(() => playGrpVideo(agoraUser, attempt + 1), 200) }
    }
    const onPublished = async (agoraUser, mediaType) => {
      await client.subscribe(agoraUser, mediaType)
      if (mediaType === 'video') {
        setRemoteUsers(prev =>
          prev.find(u => u.uid === agoraUser.uid) ? prev : [...prev, agoraUser]
        )
        setTimeout(() => playGrpVideo(agoraUser), 100)
      }
      if (mediaType === 'audio') agoraUser.audioTrack?.play()
    }
    const onUnpublished = u => setRemoteUsers(prev => prev.filter(x => x.uid !== u.uid))
    const onLeft        = u => setRemoteUsers(prev => prev.filter(x => x.uid !== u.uid))

    client.on('user-published',   onPublished)
    client.on('user-unpublished', onUnpublished)
    client.on('user-left',        onLeft)
    return () => {
      client.off('user-published',   onPublished)
      client.off('user-unpublished', onUnpublished)
      client.off('user-left',        onLeft)
    }
  }, [])

  useEffect(() => {
    const onEnded = () => { cleanup(); onEnd() }
    socket.on('call:ended', onEnded)
    return () => socket.off('call:ended', onEnded)
  }, [])

  useEffect(() => {
    if (!isIncoming) {
      socket.emit('call:group_start', {
        toUserIds:  remoteUserIds,
        fromUserId: user.id,
        fromName:   user.name,
        fromAvatar: user.avatar_url,
        callType,
        conversationId,
      })
      joinChannel(callType === 'video')
    }
  }, [])

  const cleanup = async () => {
    localTracksRef.current.audio?.close()
    localTracksRef.current.video?.close()
    localTracksRef.current = { audio: null, video: null }
    try { if (clientRef.current) await clientRef.current.leave() } catch {}
  }

  const acceptCall = async () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    await joinChannel(callType === 'video')
  }
  const rejectCall = () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    onEnd()
  }
  const leaveCall = async () => {
    socket.emit('call:group_leave', { toUserIds: remoteUserIds, fromUserId: user.id })
    await cleanup(); onEnd()
  }
  const toggleMute   = () => {
    const a = localTracksRef.current.audio
    if (a) { a.setEnabled(!a.enabled); setIsMuted(m => !m) }
  }
  const toggleCamera = () => {
    const v = localTracksRef.current.video
    if (v) { v.setEnabled(!v.enabled); setIsCameraOff(c => !c) }
  }

  const avatarBg    = contact?.color || '#7c3aed'
  const initials    = contact?.name?.substring(0, 2).toUpperCase() || '??'
  const isVideo     = callType === 'video'
  const isActive    = status === 'active'
  const totalRemote = remoteUsers.length

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>

      {isActive && isVideo && (
        <div style={{ position:'absolute', inset:0, display:'grid',
          gridTemplateColumns: totalRemote <= 1 ? '1fr' : totalRemote <= 3 ? '1fr 1fr' : '1fr 1fr 1fr',
          gap:4 }}>
          {remoteUsers.length === 0 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'white', opacity:0.5 }}>
              Esperando participantes...
            </div>
          )}
          {remoteUsers.map(u => (
            <div key={u.uid} id={`grp-remote-${u.uid}`}
              style={{ background:'#1e293b', borderRadius:4, minHeight:200 }} />
          ))}
        </div>
      )}

      {isActive && isVideo && (
        <div ref={localVideoRef}
          style={{ position:'absolute', bottom:100, right:16, width:100, height:140, borderRadius:12, border:'2px solid white', overflow:'hidden', background:'#1e293b', zIndex:10 }} />
      )}

      {status === 'incoming' && (
        <div style={{ textAlign:'center', color:'white' }}>
          <p style={{ fontSize:14, opacity:0.7, marginBottom:16 }}>
            {isVideo ? '📹 Videollamada grupal entrante' : '📞 Llamada grupal entrante'}
          </p>
          <div style={{ width:80, height:80, borderRadius:'50%', background:avatarBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:600, color:'white', margin:'0 auto 16px', overflow:'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : initials}
          </div>
          <h2 style={{ fontSize:24, fontWeight:600, margin:'0 0 4px' }}>{contact?.name}</h2>
          <p style={{ fontSize:13, opacity:0.6, margin:'0 0 40px' }}>👥 Llamada grupal</p>
          <div style={{ display:'flex', gap:24, justifyContent:'center' }}>
            <button onClick={rejectCall} style={{ width:64, height:64, borderRadius:'50%', background:'#ef4444', border:'none', fontSize:24, cursor:'pointer' }}>❌</button>
            <button onClick={acceptCall} style={{ width:64, height:64, borderRadius:'50%', background:'#22c55e', border:'none', fontSize:24, cursor:'pointer' }}>✅</button>
          </div>
        </div>
      )}

      {status === 'calling' && (
        <div style={{ textAlign:'center', color:'white' }}>
          <div style={{ width:80, height:80, borderRadius:'50%', background:avatarBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:600, color:'white', margin:'0 auto 16px', overflow:'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : initials}
          </div>
          <h2 style={{ fontSize:24, fontWeight:600, margin:'0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity:0.6, fontSize:14, animation:'pulse 1.5s infinite' }}>Conectando al grupo...</p>
          <button onClick={leaveCall} style={{ marginTop:40, width:64, height:64, borderRadius:'50%', background:'#ef4444', border:'none', fontSize:24, cursor:'pointer' }}>🔴</button>
        </div>
      )}

      {isActive && (
        <>
          {!isVideo && (
            <div style={{ textAlign:'center', color:'white', marginBottom:40 }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:avatarBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:600, color:'white', margin:'0 auto 16px', overflow:'hidden' }}>
                {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : initials}
              </div>
              <h2 style={{ fontSize:22, fontWeight:600, margin:'0 0 4px' }}>{contact?.name}</h2>
              <p style={{ opacity:0.5, fontSize:12, margin:'0 0 8px' }}>👥 {totalRemote + 1} participantes</p>
              <p style={{ opacity:0.7, fontSize:14 }}>{formatTime(callDuration)}</p>
            </div>
          )}
          {isVideo && (
            <div style={{ position:'absolute', top:16, left:16, color:'white', fontSize:14, background:'rgba(0,0,0,0.5)', padding:'4px 12px', borderRadius:20, zIndex:10 }}>
              {formatTime(callDuration)} · 👥 {totalRemote + 1}
            </div>
          )}
          <div style={{ position:'absolute', bottom:40, display:'flex', gap:16, alignItems:'center', zIndex:10 }}>
            <button onClick={toggleMute} style={{ width:52, height:52, borderRadius:'50%', background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.2)', border:'none', fontSize:20, cursor:'pointer' }}>
              {isMuted ? '🔇' : '🎤'}
            </button>
            {isVideo && <button onClick={toggleCamera} style={{ width:52, height:52, borderRadius:'50%', background: isCameraOff ? '#ef4444' : 'rgba(255,255,255,0.2)', border:'none', fontSize:20, cursor:'pointer' }}>{isCameraOff ? '📵' : '📷'}</button>}
            <button onClick={leaveCall} style={{ width:64, height:64, borderRadius:'50%', background:'#ef4444', border:'none', fontSize:24, cursor:'pointer' }}>📵</button>
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
    </div>
  )
}