import { useEffect, useRef, useState } from 'react'
import socket from '../services/socket'
import api from '../services/api'

const FILTERS = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'grayscale', label: 'B&N', css: 'grayscale(100%)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(100%)' },
  { id: 'brightness', label: 'Brillo', css: 'brightness(1.4)' },
  { id: 'contrast', label: 'Contraste', css: 'contrast(1.8)' },
  { id: 'blur', label: 'Suave', css: 'blur(1.5px)' },
]

export default function VideoCall({ call, user, onEnd }) {
  const { contact, callType: initialCallType, isIncoming, remoteUserId } = call

  const ringtoneRef = useRef(null)
  const localVideoRef = useRef()
  const remoteVideoRef = useRef()
  const pcRef = useRef()
  const localStreamRef = useRef()
  const pendingCandidatesRef = useRef([])

  const [iceServers, setIceServers] = useState([{ urls: 'stun:stun.l.google.com:19302' }])
  const [callType, setCallType] = useState(initialCallType)
  const [status, setStatus] = useState(isIncoming ? 'incoming' : 'calling')
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [activeFilter, setActiveFilter] = useState('none')
  const [callDuration, setCallDuration] = useState(0)
  const [upgradeRequested, setUpgradeRequested] = useState(false)

  // Cargar credenciales TURN de Twilio
  useEffect(() => {
    api.get('/turn-credentials')
      .then(res => { if (res.data) setIceServers(res.data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (status === 'incoming') {
      const audio = new Audio('/ringtone.mp3')
      audio.loop = true
      audio.play().catch(() => {})
      ringtoneRef.current = audio
    }
    return () => { ringtoneRef.current?.pause(); ringtoneRef.current = null }
  }, [status])

  useEffect(() => {
    if (status !== 'active') return
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [status])

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const attachStream = (ref, stream) => {
    if (ref.current) {
      ref.current.srcObject = stream
      ref.current.play().catch(() => {})
    }
  }

  const getLocalStream = async (video = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
      localStreamRef.current = stream
      attachStream(localVideoRef, stream)
      return stream
    } catch (err) {
      console.error('Error accediendo a medios:', err)
      alert('No se puede acceder al micrófono/cámara. Verifica los permisos del navegador.')
      return null
    }
  }

  const createPC = (stream) => {
    if (pcRef.current) pcRef.current.close()
    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc
    stream.getTracks().forEach(track => pc.addTrack(track, stream))
    pc.ontrack = (e) => {
      console.log('Track recibido:', e.track.kind)
      if (e.streams?.[0]) attachStream(remoteVideoRef, e.streams[0])
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc:ice', { toUserId: remoteUserId, candidate: e.candidate })
    }
    pc.onconnectionstatechange = () => console.log('WebRTC:', pc.connectionState)
    return pc
  }

  const startOutgoingCall = async (ct) => {
    const stream = await getLocalStream(ct === 'video')
    if (!stream) return
    const pc = createPC(stream)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('webrtc:offer', { toUserId: remoteUserId, offer })
    setStatus('active')
  }

  const acceptCall = async () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    const stream = await getLocalStream(callType === 'video')
    if (!stream) return
    createPC(stream)
    setStatus('active')
    socket.emit('call:accept', { toUserId: remoteUserId, callType })
  }

  const rejectCall = () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    socket.emit('call:reject', { toUserId: remoteUserId })
    onEnd()
  }

  const endCall = () => { socket.emit('call:end', { toUserId: remoteUserId }); cleanup(); onEnd() }

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close(); pcRef.current = null
  }

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setIsCameraOff(c => !c)
  }

  const upgradeToVideo = async () => {
    socket.emit('call:upgrade', { toUserId: remoteUserId })
    setCallType('video')
    
    try {
      const newStream = await getLocalStream(true)
      if (!newStream || !pcRef.current) return
      
      const videoTrack = newStream.getVideoTracks()[0]
      const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
      
      if (sender) {
        await sender.replaceTrack(videoTrack)
      } else {
        pcRef.current.addTrack(videoTrack, newStream)
      }

      const offer = await pcRef.current.createOffer()
      await pcRef.current.setLocalDescription(offer)
      socket.emit('webrtc:offer', { toUserId: remoteUserId, offer })
    } catch (err) {
      console.error('Error al subir a video:', err)
    }
  }

  const applyFilter = (filterId) => {
    setActiveFilter(filterId)
    const filter = FILTERS.find(f => f.id === filterId)
    if (localVideoRef.current) localVideoRef.current.style.filter = filter.css
  }

  const addIceCandidate = async (candidate) => {
    if (pcRef.current?.remoteDescription) {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
    } else {
      pendingCandidatesRef.current.push(candidate)
    }
  }

  const flushPendingCandidates = async () => {
    for (const c of pendingCandidatesRef.current) {
      await pcRef.current?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
    }
    pendingCandidatesRef.current = []
  }

  useEffect(() => {
    socket.on('call:accepted', async ({ callType: ct }) => { setCallType(ct); await startOutgoingCall(ct) })

    socket.on('webrtc:offer', async ({ offer }) => {
      if (!pcRef.current) return
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer))
        await flushPendingCandidates()
        const answer = await pcRef.current.createAnswer()
        await pcRef.current.setLocalDescription(answer)
        socket.emit('webrtc:answer', { toUserId: remoteUserId, answer })
      } catch (err) {
        console.error('Error procesando offer:', err)
      }
    })

    socket.on('webrtc:answer', async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer))
      await flushPendingCandidates()
    })

    socket.on('webrtc:ice', async ({ candidate }) => { await addIceCandidate(candidate) })
    socket.on('call:ended', () => { cleanup(); onEnd() })
    socket.on('call:rejected', () => { cleanup(); onEnd() })
    socket.on('call:upgrade', async () => {
      setUpgradeRequested(true)
      setCallType('video')
      // Obtener stream de video local también
      const stream = await getLocalStream(true)
      if (!stream || !pcRef.current) return
      const videoTrack = stream.getVideoTracks()[0]
      const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
      if (sender) sender.replaceTrack(videoTrack)
      else pcRef.current.addTrack(videoTrack, stream)
    })

    return () => {
      socket.off('call:accepted'); socket.off('webrtc:offer'); socket.off('webrtc:answer')
      socket.off('webrtc:ice'); socket.off('call:ended'); socket.off('call:rejected'); socket.off('call:upgrade')
    }
  }, [remoteUserId])

  useEffect(() => {
    if (!isIncoming) {
      socket.emit('call:start', { toUserId: remoteUserId, fromUserId: user.id, fromName: user.name, fromAvatar: user.avatar_url, callType })
    }
  }, [])

  useEffect(() => { return cleanup }, [])

  const avatarBg = contact?.color || '#3b82f6'
  const initials = contact?.name?.substring(0, 2).toUpperCase() || '??'
  const isVideo = callType === 'video'
  const isActive = status === 'active'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: isVideo && isActive ? '#000' : '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

      <video ref={remoteVideoRef} autoPlay playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', visibility: isVideo && isActive ? 'visible' : 'hidden', opacity: isVideo && isActive ? 1 : 0 }} />

      <video ref={localVideoRef} autoPlay playsInline muted
        style={{ position: 'absolute', bottom: 100, right: 16, width: 100, height: 140, objectFit: 'cover', borderRadius: 12, border: '2px solid white', visibility: isVideo && isActive ? 'visible' : 'hidden', opacity: isVideo && isActive ? 1 : 0 }} />

      {status === 'incoming' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>{isVideo ? '📹 Videollamada entrante' : '📞 Llamada entrante'}</p>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'white', margin: '0 auto 16px', overflow: 'hidden' }}>
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : initials}
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
            {contact?.avatar_url ? <img src={contact.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : initials}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity: 0.6, fontSize: 14, animation: 'pulse 1.5s infinite' }}>Llamando...</p>
          <button onClick={endCall} style={{ marginTop: 40, width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>🔴</button>
        </div>
      )}

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
            <div style={{ position: 'absolute', top: 16, left: 16, color: 'white', fontSize: 14, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 20 }}>
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
            <div style={{ position: 'absolute', bottom: 160, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: 12 }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => applyFilter(f.id)} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, background: activeFilter === f.id ? '#3b82f6' : 'rgba(255,255,255,0.2)', color: 'white' }}>{f.label}</button>
              ))}
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 40, display: 'flex', gap: 16, alignItems: 'center' }}>
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

// ─────────────────────────────────────────────
// 👥 LLAMADA GRUPAL — Mesh P2P (máx. 3 personas)
// ─────────────────────────────────────────────
export function GroupVideoCall({ call, user, onEnd }) {
  const { contact, callType: initialCallType, isIncoming, remoteUserIds = [], conversationId } = call

  const ringtoneRef = useRef(null)
  const localVideoRef = useRef()
  const localStreamRef = useRef()
  // pcsRef: { [userId]: RTCPeerConnection }
  const pcsRef = useRef({})
  // pendingCandidates: { [userId]: RTCIceCandidate[] }
  const pendingRef = useRef({})

  const [iceServers, setIceServers] = useState([{ urls: 'stun:stun.l.google.com:19302' }])
  const [callType, setCallType] = useState(initialCallType)
  const [status, setStatus] = useState(isIncoming ? 'incoming' : 'calling')
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  // remoteStreams: { [userId]: MediaStream }
  const [remoteStreams, setRemoteStreams] = useState({})
  // connectedPeers: userId[]
  const [connectedPeers, setConnectedPeers] = useState([])

  // Cargar TURN
  useEffect(() => {
    api.get('/turn-credentials')
      .then(res => { if (res.data) setIceServers(res.data) })
      .catch(() => {})
  }, [])

  // Ringtone entrante
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

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const getLocalStream = async (video = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play().catch(() => {})
      }
      return stream
    } catch (err) {
      console.error('Error accediendo a medios:', err)
      alert('No se puede acceder al micrófono/cámara.')
      return null
    }
  }

  // Crea una PC para un peer específico
  const createPC = (peerId, stream) => {
    if (pcsRef.current[peerId]) pcsRef.current[peerId].close()
    const pc = new RTCPeerConnection({ iceServers })
    pcsRef.current[peerId] = pc

    stream.getTracks().forEach(track => pc.addTrack(track, stream))

    pc.ontrack = (e) => {
      if (e.streams?.[0]) {
        setRemoteStreams(prev => ({ ...prev, [peerId]: e.streams[0] }))
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc:ice', { toUserId: peerId, candidate: e.candidate })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectedPeers(prev => prev.includes(peerId) ? prev : [...prev, peerId])
      }
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setConnectedPeers(prev => prev.filter(id => id !== peerId))
        setRemoteStreams(prev => { const s = { ...prev }; delete s[peerId]; return s })
      }
    }
    return pc
  }

  const addIceCandidate = async (peerId, candidate) => {
    const pc = pcsRef.current[peerId]
    if (pc?.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
    } else {
      if (!pendingRef.current[peerId]) pendingRef.current[peerId] = []
      pendingRef.current[peerId].push(candidate)
    }
  }

  const flushPending = async (peerId) => {
    const pc = pcsRef.current[peerId]
    for (const c of (pendingRef.current[peerId] || [])) {
      await pc?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
    }
    pendingRef.current[peerId] = []
  }

  // Inicia oferta hacia un peer
  const offerTo = async (peerId, stream) => {
    const pc = createPC(peerId, stream)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('webrtc:offer', { toUserId: peerId, offer })
  }

  // Llamada saliente — avisa a todos y espera que se unan
  const startGroupCall = async () => {
    const stream = await getLocalStream(callType === 'video')
    if (!stream) return
    socket.emit('call:group_start', {
      toUserIds: remoteUserIds,
      fromUserId: user.id,
      fromName: user.name,
      fromAvatar: user.avatar_url,
      callType,
      conversationId
    })
    setStatus('calling')
  }

  // Aceptar llamada entrante
  const acceptCall = async () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    const stream = await getLocalStream(callType === 'video')
    if (!stream) return
    setStatus('active')
    // Avisar a todos los participantes que me uní
    const others = remoteUserIds.filter(id => id !== user.id)
    socket.emit('call:group_join', { toUserIds: others, fromUserId: user.id, callType })
    // Crear PC para cada peer ya conectado
    others.forEach(peerId => createPC(peerId, stream))
  }

  const rejectCall = () => {
    ringtoneRef.current?.pause(); ringtoneRef.current = null
    onEnd()
  }

  const leaveCall = () => {
    const others = remoteUserIds.filter(id => id !== user.id)
    socket.emit('call:group_leave', { toUserIds: others, fromUserId: user.id })
    cleanup()
    onEnd()
  }

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    Object.values(pcsRef.current).forEach(pc => pc.close())
    pcsRef.current = {}
  }

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setIsCameraOff(c => !c)
  }

  // Eventos socket grupales
  useEffect(() => {
    // Cuando un peer se une → le hacemos oferta
    socket.on('call:group_peer_joined', async ({ fromUserId }) => {
      setStatus('active')
      const stream = localStreamRef.current
      if (stream) await offerTo(fromUserId, stream)
      setConnectedPeers(prev => prev.includes(fromUserId) ? prev : [...prev, fromUserId])
    })

    // Cuando un peer se va
    socket.on('call:group_peer_left', ({ fromUserId }) => {
      pcsRef.current[fromUserId]?.close()
      delete pcsRef.current[fromUserId]
      setConnectedPeers(prev => prev.filter(id => id !== fromUserId))
      setRemoteStreams(prev => { const s = { ...prev }; delete s[fromUserId]; return s })
    })

    // Recibir offer de un peer
    socket.on('webrtc:offer', async ({ offer, fromUserId: peerId }) => {
      const stream = localStreamRef.current
      if (!stream) return
      const pc = createPC(peerId, stream)
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      await flushPending(peerId)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('webrtc:answer', { toUserId: peerId, answer })
    })

    // Recibir answer
    socket.on('webrtc:answer', async ({ answer, fromUserId: peerId }) => {
      // fromUserId no viene en el evento original, usamos remoteDescription pendiente
      // buscamos la PC sin remoteDescription
      for (const [uid, pc] of Object.entries(pcsRef.current)) {
        if (!pc.remoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
          await flushPending(uid)
          break
        }
      }
    })

    // ICE candidates
    socket.on('webrtc:ice', async ({ candidate, fromUserId: peerId }) => {
      // peerId no viene, intentamos aplicar a todas las PCs sin remoteDescription
      for (const [uid] of Object.entries(pcsRef.current)) {
        await addIceCandidate(uid, candidate)
      }
    })

    socket.on('call:ended', () => { cleanup(); onEnd() })

    return () => {
      socket.off('call:group_peer_joined')
      socket.off('call:group_peer_left')
      socket.off('webrtc:offer')
      socket.off('webrtc:answer')
      socket.off('webrtc:ice')
      socket.off('call:ended')
    }
  }, [remoteUserIds, iceServers])

  // Arrancar llamada saliente al montar
  useEffect(() => {
    if (!isIncoming) startGroupCall()
    return cleanup
  }, [])

  const isVideo = callType === 'video'
  const isActive = status === 'active'
  const avatarBg = contact?.color || '#7c3aed'
  const remoteStreamsArr = Object.entries(remoteStreams)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

      {/* Video local (esquina) */}
      {isActive && isVideo && (
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{ position: 'absolute', bottom: 100, right: 16, width: 100, height: 140, objectFit: 'cover', borderRadius: 12, border: '2px solid white', zIndex: 10 }} />
      )}

      {/* Grid de videos remotos */}
      {isActive && isVideo && remoteStreamsArr.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: remoteStreamsArr.length === 1 ? '1fr' : '1fr 1fr', gap: 8, width: '100%', height: '70%', padding: 16 }}>
          {remoteStreamsArr.map(([uid, stream]) => (
            <RemoteVideo key={uid} stream={stream} />
          ))}
        </div>
      )}

      {/* Pantalla de llamada entrante */}
      {status === 'incoming' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>{isVideo ? '📹 Videollamada grupal entrante' : '📞 Llamada grupal entrante'}</p>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>
            👥
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity: 0.6, fontSize: 13 }}>Llamada grupal · {remoteUserIds.length + 1} participantes</p>
          <div style={{ display: 'flex', gap: 24, marginTop: 40, justifyContent: 'center' }}>
            <button onClick={rejectCall} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>❌</button>
            <button onClick={acceptCall} style={{ width: 64, height: 64, borderRadius: '50%', background: '#22c55e', border: 'none', fontSize: 24, cursor: 'pointer' }}>✅</button>
          </div>
        </div>
      )}

      {/* Llamando... */}
      {status === 'calling' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>
            👥
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity: 0.6, fontSize: 14, animation: 'pulse 1.5s infinite' }}>Llamando al grupo...</p>
          <p style={{ opacity: 0.4, fontSize: 12, marginTop: 4 }}>{connectedPeers.length} de {remoteUserIds.length} conectados</p>
          <button onClick={leaveCall} style={{ marginTop: 40, width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>🔴</button>
        </div>
      )}

      {/* Llamada activa — audio sin video */}
      {isActive && !isVideo && (
        <div style={{ textAlign: 'center', color: 'white', marginBottom: 40 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>
            👥
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>{contact?.name}</h2>
          <p style={{ opacity: 0.7, fontSize: 14 }}>{formatTime(callDuration)}</p>
          <p style={{ opacity: 0.5, fontSize: 12 }}>{connectedPeers.length + 1} participantes</p>
        </div>
      )}

      {/* Timer en video */}
      {isActive && isVideo && (
        <div style={{ position: 'absolute', top: 16, left: 16, color: 'white', fontSize: 14, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 20 }}>
          {formatTime(callDuration)} · {connectedPeers.length + 1} 👥
        </div>
      )}

      {/* Controles */}
      {isActive && (
        <div style={{ position: 'absolute', bottom: 40, display: 'flex', gap: 16, alignItems: 'center' }}>
          <button onClick={toggleMute} style={{ width: 52, height: 52, borderRadius: '50%', background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }}>
            {isMuted ? '🔇' : '🎤'}
          </button>
          {isVideo && (
            <button onClick={toggleCamera} style={{ width: 52, height: 52, borderRadius: '50%', background: isCameraOff ? '#ef4444' : 'rgba(255,255,255,0.2)', border: 'none', fontSize: 20, cursor: 'pointer' }}>
              {isCameraOff ? '📵' : '📷'}
            </button>
          )}
          <button onClick={leaveCall} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', fontSize: 24, cursor: 'pointer' }}>
            📵
          </button>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
    </div>
  )
}

// Sub-componente para video remoto
function RemoteVideo({ stream }) {
  const ref = useRef()
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
      ref.current.play().catch(() => {})
    }
  }, [stream])
  return (
    <video ref={ref} autoPlay playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, background: '#0f172a' }} />
  )
}