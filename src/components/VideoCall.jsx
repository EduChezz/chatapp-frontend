import { useEffect, useRef, useState } from 'react'
import socket from '../services/socket'

const FILTERS = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'grayscale', label: 'B&N', css: 'grayscale(100%)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(100%)' },
  { id: 'brightness', label: 'Brillo', css: 'brightness(1.4)' },
  { id: 'contrast', label: 'Contraste', css: 'contrast(1.8)' },
  { id: 'blur', label: 'Suave', css: 'blur(1.5px)' },
]

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }

export default function VideoCall({ call, user, onEnd }) {
  const { contact, callType: initialCallType, isIncoming, remoteUserId } = call

  const ringtoneRef = useRef(null)
  const localVideoRef = useRef()
  const remoteVideoRef = useRef()
  const pcRef = useRef()
  const localStreamRef = useRef()
  const pendingCandidatesRef = useRef([])

  const [callType, setCallType] = useState(initialCallType)
  const [status, setStatus] = useState(isIncoming ? 'incoming' : 'calling')
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [activeFilter, setActiveFilter] = useState('none')
  const [callDuration, setCallDuration] = useState(0)
  const [upgradeRequested, setUpgradeRequested] = useState(false)

  useEffect(() => {
    if (status === 'incoming') {
      const audio = new Audio('/ringtone.mp3')
      audio.loop = true
      audio.play().catch(() => {})
      ringtoneRef.current = audio
    }
    return () => {
      ringtoneRef.current?.pause()
      ringtoneRef.current = null
    }
  }, [status])

  useEffect(() => {
    if (status !== 'active') return
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [status])

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const getLocalStream = async (video = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      return stream
    } catch (err) {
      console.error('Error accediendo a medios:', err)
      alert('No se puede acceder al micrófono/cámara. Verifica los permisos.')
      return null
    }
  }

  const createPC = (stream) => {
    if (pcRef.current) pcRef.current.close()
    const pc = new RTCPeerConnection(STUN)
    pcRef.current = pc

    stream.getTracks().forEach(track => pc.addTrack(track, stream))

    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0]
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('webrtc:ice', { toUserId: remoteUserId, candidate: e.candidate })
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('WebRTC state:', pc.connectionState)
    }

    return pc
  }

  // Llamada saliente: obtener stream + crear PC + enviar offer
  const startOutgoingCall = async (ct) => {
    const stream = await getLocalStream(ct === 'video')
    if (!stream) return
    const pc = createPC(stream)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('webrtc:offer', { toUserId: remoteUserId, offer })
    setStatus('active')
  }

  // Llamada entrante: obtener stream + crear PC (espera el offer)
  const acceptCall = async () => {
    ringtoneRef.current?.pause()
    ringtoneRef.current = null
    const stream = await getLocalStream(callType === 'video')
    if (!stream) return
    createPC(stream)
    setStatus('active')
    socket.emit('call:accept', { toUserId: remoteUserId, callType })
  }

  // Rechazar llamada
  const rejectCall = () => {
    ringtoneRef.current?.pause()
    ringtoneRef.current = null
    socket.emit('call:reject', { toUserId: remoteUserId })
    onEnd()
  }

  // Colgar
  const endCall = () => {
    socket.emit('call:end', { toUserId: remoteUserId })
    cleanup()
    onEnd()
  }

  // Limpiar recursos
  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    pcRef.current = null
  }

  // Silenciar
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }

  // Apagar cámara
  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setIsCameraOff(c => !c)
  }

  // Subir a videollamada
  const upgradeToVideo = async () => {
    socket.emit('call:upgrade', { toUserId: remoteUserId })
    setCallType('video')
    const newStream = await getLocalStream(true)
    if (!newStream || !pcRef.current) return
    const videoTrack = newStream.getVideoTracks()[0]
    const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
    if (sender) sender.replaceTrack(videoTrack)
    else pcRef.current.addTrack(videoTrack, newStream)
  }

  // Aplicar filtro
  const applyFilter = (filterId) => {
    setActiveFilter(filterId)
    const filter = FILTERS.find(f => f.id === filterId)
    if (localVideoRef.current) localVideoRef.current.style.filter = filter.css
  }

  // Eventos Socket — señalización WebRTC
  useEffect(() => {
    // Llamada saliente: el otro aceptó → iniciamos WebRTC
    socket.on('call:accepted', async ({ callType: ct }) => {
      setCallType(ct)
      await startOutgoingCall(ct)
    })

    // Recibimos offer (el que llama nos envía su descripción)
    socket.on('webrtc:offer', async ({ offer }) => {
      if (!pcRef.current) return
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer))
      // Aplicar candidatos ICE pendientes
      for (const c of pendingCandidatesRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
      }
      pendingCandidatesRef.current = []
      const answer = await pcRef.current.createAnswer()
      await pcRef.current.setLocalDescription(answer)
      socket.emit('webrtc:answer', { toUserId: remoteUserId, answer })
    })

    // Recibimos answer (el que recibe confirma)
    socket.on('webrtc:answer', async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer))
      // Aplicar candidatos ICE pendientes
      for (const c of pendingCandidatesRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
      }
      pendingCandidatesRef.current = []
    })

    // Candidatos ICE — guardamos si aún no hay remoteDescription
    socket.on('webrtc:ice', async ({ candidate }) => {
      if (pcRef.current?.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      } else {
        pendingCandidatesRef.current.push(candidate)
      }
    })

    socket.on('call:ended', () => { cleanup(); onEnd() })
    socket.on('call:rejected', () => { cleanup(); onEnd() })
    socket.on('call:upgrade', () => setUpgradeRequested(true))

    return () => {
      socket.off('call:accepted')
      socket.off('webrtc:offer')
      socket.off('webrtc:answer')
      socket.off('webrtc:ice')
      socket.off('call:ended')
      socket.off('call:rejected')
      socket.off('call:upgrade')
    }
  }, [remoteUserId])

  // Llamada saliente: avisar al otro usuario
  useEffect(() => {
    if (!isIncoming) {
      socket.emit('call:start', {
        toUserId: remoteUserId,
        fromUserId: user.id,
        fromName: user.name,
        fromAvatar: user.avatar_url,
        callType
      })
    }
  }, [])

  // Limpiar al desmontar
  useEffect(() => { return cleanup }, [])

  const avatarBg = contact?.color || '#3b82f6'
  const initials = contact?.name?.substring(0, 2).toUpperCase() || '??'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: callType === 'video' && status === 'active' ? '#000' : '#1e293b',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>

      {/* VIDEO REMOTO */}
      {callType === 'video' && status === 'active' && (
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}

      {/* VIDEO LOCAL (esquina) */}
      {callType === 'video' && status === 'active' && (
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{
            position: 'absolute', bottom: 100, right: 16,
            width: 100, height: 140, objectFit: 'cover',
            borderRadius: 12, border: '2px solid white',
          }} />
      )}

      {status === 'incoming' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
            {callType === 'video' ? '📹 Videollamada entrante' : '📞 Llamada entrante'}
          </p>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'white', margin: '0 auto 16px', overflow: 'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity: 0.6, fontSize: 14 }}>{contact?.status || 'en línea'}</p>
          <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
            <button onClick={rejectCall} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>❌</button>
            <button onClick={acceptCall} style={{ width: 64, height: 64, borderRadius: '50%', background: '#22c55e', border: 'none', fontSize: 24, cursor: 'pointer' }}>✅</button>
          </div>
        </div>
      )}

      {status === 'calling' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'white', margin: '0 auto 16px', overflow: 'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity: 0.6, fontSize: 14, animation: 'pulse 1.5s infinite' }}>Llamando...</p>
          <button onClick={endCall} style={{ marginTop: 40, width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>🔴</button>
        </div>
      )}

      {status === 'active' && (
        <>
          {callType !== 'video' && (
            <div style={{ textAlign: 'center', color: 'white', marginBottom: 40 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'white', margin: '0 auto 16px', overflow: 'hidden' }}>
                {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
              <p style={{ opacity: 0.7, fontSize: 14 }}>{formatTime(callDuration)}</p>
            </div>
          )}

          {callType === 'video' && (
            <div style={{ position: 'absolute', top: 16, left: 16, color: 'white', fontSize: 14, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 20 }}>
              {formatTime(callDuration)}
            </div>
          )}

          {upgradeRequested && callType === 'audio' && (
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 20px', marginBottom: 20, textAlign: 'center', color: 'white' }}>
              <p style={{ fontSize: 13, marginBottom: 8 }}>{contact?.name} quiere activar el video</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => { setUpgradeRequested(false); upgradeToVideo() }} style={{ background: '#22c55e', border: 'none', color: 'white', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>Aceptar</button>
                <button onClick={() => setUpgradeRequested(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>Rechazar</button>
              </div>
            </div>
          )}

          {showFilters && callType === 'video' && (
            <div style={{ position: 'absolute', bottom: 160, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 12 }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => applyFilter(f.id)} style={{
                  padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: activeFilter === f.id ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                  color: 'white', fontWeight: activeFilter === f.id ? 600 : 400
                }}>{f.label}</button>
              ))}
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 40, display: 'flex', gap: 16, alignItems: 'center' }}>
            <button onClick={toggleMute} style={{ width: 52, height: 52, borderRadius: '50%', background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }}>
              {isMuted ? '🔇' : '🎤'}
            </button>

            {callType === 'video' && (
              <button onClick={toggleCamera} style={{ width: 52, height: 52, borderRadius: '50%', background: isCameraOff ? '#ef4444' : 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }}>
                {isCameraOff ? '📵' : '📷'}
              </button>
            )}

            {callType === 'video' && (
              <button onClick={() => setShowFilters(f => !f)} style={{ width: 52, height: 52, borderRadius: '50%', background: showFilters ? '#3b82f6' : 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }}>
                🎨
              </button>
            )}

            {callType === 'audio' && (
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