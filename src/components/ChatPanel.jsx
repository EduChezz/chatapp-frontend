import { useState, useRef, useEffect } from 'react'
import ImageViewer from './ImageViewer'
import { useTheme } from '../context/ThemeContext'
import { playNotificationSound, requestNotificationPermission, showDesktopNotification } from '../utils/notify'

// 1. NUEVOS IMPORTS PARA EL BACKEND
import api from '../services/api'
import socket from '../services/socket'
import { useAuth } from '../context/AuthContext'

const EMOJIS = ['😀','😂','❤️','🔥','👍','😮','😢','🎉','🙏','💯']
const REACTIONS = ['❤️','😂','👍','😮','😢','🔥']

export default function ChatPanel({ activeChat, contacts }) {
  const { dark } = useTheme()
  
  // 2. NUEVOS ESTADOS DEL PASO 7
  const { user } = useAuth()
  const [allMessages, setAllMessages] = useState({})
  const [input, setInput] = useState('')
  const [showEmojis, setShowEmojis] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [showReactions, setShowReactions] = useState(null)
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  const contact = contacts.find(c => c.id === activeChat)
  const messages = allMessages[activeChat] || []

  // Permiso de notificaciones
  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeChat])

  // 3. CARGAR MENSAJES DE LA BASE DE DATOS (PASO 7)
  useEffect(() => {
    if (!activeChat) return
    api.get(`/messages/${activeChat}`).then(res => {
      setAllMessages(prev => ({ ...prev, [activeChat]: res.data }))
      socket.emit('conversation:join', activeChat)
    }).catch(err => console.error("Error al cargar mensajes:", err))
  }, [activeChat])

  // 4. ESCUCHAR MENSAJES EN TIEMPO REAL (PASO 7)
  useEffect(() => {
    socket.on('message:new', (msg) => {
      const isMine = msg.sender_id === user?.id
      setAllMessages(prev => ({
        ...prev,
        [msg.conversation_id]: [
          ...(prev[msg.conversation_id] || []),
          { ...msg, sent: isMine }
        ]
      }))
      if (!isMine) {
        playNotificationSound()
        showDesktopNotification(contact?.name || 'Nuevo mensaje', msg.content)
      }
    })

    socket.on('typing:start', () => setIsTyping(true))
    socket.on('typing:stop', () => setIsTyping(false))

    return () => {
      socket.off('message:new')
      socket.off('typing:start')
      socket.off('typing:stop')
    }
  }, [activeChat, contact, user])

  // 5. NUEVA FUNCIÓN PARA ENVIAR (PASO 7)
  const sendMessage = (text, type = 'text', extra = {}) => {
    if (type === 'text' && !text.trim()) return
    socket.emit('message:send', {
      conversationId: activeChat,
      senderId: user?.id,
      content: text,
      type,
      fileName: extra.fileName || null,
      fileSize: extra.fileSize || null,
    })
    setInput('')
    setShowEmojis(false)
    socket.emit('typing:stop', { conversationId: activeChat })
  }

  // 6. NUEVA FUNCIÓN PARA SUBIR ARCHIVOS (PASO 7)
  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await api.post('/upload', formData)
      const { url, fileName, fileSize, type } = res.data
      sendMessage(url, type, { fileName, fileSize })
    } catch (err) {
      console.error('Error subiendo archivo:', err)
    }
    e.target.value = ''
  }

  // Reacciones visuales ajustadas a la nueva estructura
  const addReaction = (msgId, emoji) => {
    setAllMessages(prev => {
      const chatMsgs = prev[activeChat] || []
      return {
        ...prev,
        [activeChat]: chatMsgs.map(m => {
          if (m.id !== msgId) return m
          const reactions = m.reactions || []
          const exists = reactions.find(r => r.emoji === emoji)
          const newReactions = exists
            ? reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r)
            : [...reactions, { emoji, count: 1 }]
          return { ...m, reactions: newReactions }
        })
      }
    })
    setShowReactions(null)
  }

  // Colores según modo
  const headerBg = dark ? '#1e293b' : 'white'
  const headerBorder = dark ? '#334155' : '#e2e8f0'
  const msgAreaBg = dark ? '#0f172a' : '#f8fafc'
  const inputBarBg = dark ? '#1e293b' : 'white'
  const inputBg = dark ? '#0f172a' : '#f8fafc'
  const inputBorder = dark ? '#334155' : '#e2e8f0'
  const bubbleInBg = dark ? '#1e293b' : 'white'
  const bubbleInColor = dark ? '#f1f5f9' : '#1e293b'
  const bubbleInBorder = dark ? '#334155' : '#e2e8f0'
  const timeColor = dark ? '#64748b' : '#94a3b8'
  const reactionBg = dark ? '#1e293b' : 'white'
  const reactionBorder = dark ? '#334155' : '#e2e8f0'

  if (!activeChat) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msgAreaBg, color: timeColor }}>
      <h2>Selecciona un chat para empezar</h2>
    </div>
  )

  return (
    <>
      <ImageViewer src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* Header */}
        <div style={{
          padding: '12px 20px',
          background: headerBg,
          borderBottom: `1px solid ${headerBorder}`,
          display: 'flex', alignItems: 'center', gap: '12px',
          transition: 'background 0.3s'
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: contact?.color || '#3b82f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '13px', fontWeight: '500'
          }}>
            {contact?.name?.substring(0, 2).toUpperCase() || '?'}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: '500', fontSize: '14px', color: dark ? '#f1f5f9' : '#1e293b' }}>
              {contact?.name || 'Chat'}
              {contact?.is_group && (
                <span style={{ marginLeft: '6px', fontSize: '12px', color: '#7c3aed' }}>👥 Grupo</span>
              )}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: isTyping ? '#3b82f6' : '#94a3b8' }}>
              {isTyping ? '✏️ escribiendo...' : (contact?.status || 'en línea')}
            </p>
          </div>
        </div>

        {/* Área de mensajes */}
        <div
          onClick={() => { setShowEmojis(false); setShowReactions(null) }}
          style={{
            flex: 1, overflowY: 'auto', padding: '20px 16px',
            display: 'flex', flexDirection: 'column', gap: '8px',
            background: msgAreaBg, transition: 'background 0.3s'
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex', justifyContent: msg.sent ? 'flex-end' : 'flex-start',
                animation: 'msgIn 0.2s cubic-bezier(0.19,1,0.22,1)'
              }}
              onMouseEnter={() => setHoveredMsg(msg.id)}
              onMouseLeave={() => { setHoveredMsg(null); setShowReactions(null) }}
            >
              <div style={{ position: 'relative', maxWidth: '65%' }}>

                {/* Botón reacción (hover) */}
                {hoveredMsg === msg.id && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowReactions(showReactions === msg.id ? null : msg.id) }}
                    style={{
                      position: 'absolute', top: '-10px',
                      [msg.sent ? 'left' : 'right']: '-10px',
                      background: reactionBg, border: `1px solid ${reactionBorder}`,
                      borderRadius: '50%', width: '26px', height: '26px',
                      cursor: 'pointer', fontSize: '13px', zIndex: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                    }}
                  >😊</button>
                )}

                {/* Picker de reacciones */}
                {showReactions === msg.id && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: '-46px',
                      [msg.sent ? 'left' : 'right']: '0',
                      background: reactionBg, borderRadius: '24px',
                      padding: '6px 10px', display: 'flex', gap: '6px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                      border: `1px solid ${reactionBorder}`, zIndex: 20,
                      animation: 'slideUp 0.2s cubic-bezier(0.19,1,0.22,1)'
                    }}
                  >
                    {REACTIONS.map(emoji => (
                      <button key={emoji} onClick={() => addReaction(msg.id, emoji)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '2px' }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Burbuja — imagen */}
                {msg.type === 'image' ? (
                  <div
                    onClick={() => setLightboxSrc(msg.content)}
                    style={{
                      borderRadius: msg.sent ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      overflow: 'hidden', cursor: 'zoom-in',
                      border: `1px solid ${reactionBorder}`,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
                    }}
                  >
                    <img src={msg.content} alt="img"
                      style={{ display: 'block', maxWidth: '220px', maxHeight: '200px', objectFit: 'cover' }} />
                  </div>

                ) : msg.type === 'file' ? (
                  /* Burbuja — archivo */
                  <a href={msg.content} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <div style={{
                      padding: '10px 14px',
                      background: msg.sent ? '#3b82f6' : bubbleInBg,
                      borderRadius: msg.sent ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      border: msg.sent ? 'none' : `1px solid ${bubbleInBorder}`,
                      display: 'flex', alignItems: 'center', gap: '10px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)', cursor: 'pointer'
                    }}>
                      <span style={{ fontSize: '24px' }}>📎</span>
                      <div>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: '500', color: msg.sent ? 'white' : bubbleInColor }}>
                          {msg.file_name}
                        </p>
                        <p style={{ margin: 0, fontSize: '11px', color: msg.sent ? '#bfdbfe' : timeColor }}>
                          {msg.file_size} · Descargar
                        </p>
                      </div>
                    </div>
                  </a>

                ) : (
                  /* Burbuja — texto */
                  <div style={{
                    padding: '10px 14px',
                    background: msg.sent ? '#3b82f6' : bubbleInBg,
                    color: msg.sent ? 'white' : bubbleInColor,
                    borderRadius: msg.sent ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    fontSize: '14px', lineHeight: '1.4',
                    border: msg.sent ? 'none' : `1px solid ${bubbleInBorder}`,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'background 0.3s'
                  }}>
                    {/* Nombre del remitente si no es un mensaje enviado por mí */}
                    {!msg.sent && <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: msg.sender_color || '#3b82f6' }}>{msg.sender_name}</div>}
                    <p style={{ margin: '0 0 4px' }}>{msg.content}</p>
                    <p style={{
                      margin: 0, fontSize: '11px', textAlign: 'right',
                      color: msg.sent ? '#bfdbfe' : timeColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px'
                    }}>
                      {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      {msg.sent && (
                        <span style={{ color: msg.read ? '#60a5fa' : '#bfdbfe', fontSize: '13px' }}>
                          {msg.read ? '✓✓' : '✓'}
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Reacciones bajo la burbuja */}
                {msg.reactions?.length > 0 && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px',
                    justifyContent: msg.sent ? 'flex-end' : 'flex-start'
                  }}>
                    {msg.reactions.map(r => (
                      <span key={r.emoji} onClick={() => addReaction(msg.id, r.emoji)}
                        style={{
                          background: reactionBg, border: `1px solid ${reactionBorder}`,
                          borderRadius: '12px', padding: '2px 6px',
                          fontSize: '12px', cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          color: dark ? '#f1f5f9' : '#1e293b'
                        }}>
                        {r.emoji} {r.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Indicador escribiendo */}
          {isTyping && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                background: bubbleInBg, border: `1px solid ${bubbleInBorder}`,
                borderRadius: '18px 18px 18px 4px',
                padding: '12px 16px', display: 'flex', gap: '4px', alignItems: 'center'
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: dark ? '#475569' : '#94a3b8',
                    display: 'inline-block',
                    animation: 'bounce 1.2s infinite',
                    animationDelay: `${i * 0.2}s`
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Emoji picker */}
        {showEmojis && (
          <div style={{
            background: inputBarBg, borderTop: `1px solid ${inputBorder}`,
            padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px',
            transition: 'background 0.3s'
          }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setInput(prev => prev + e)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', padding: '4px' }}>
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Barra de input */}
        <div style={{
          padding: '12px 16px', background: inputBarBg,
          borderTop: `1px solid ${inputBorder}`,
          display: 'flex', alignItems: 'center', gap: '8px',
          transition: 'background 0.3s'
        }}>
          <button onClick={() => setShowEmojis(p => !p)}
            style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>
            😊
          </button>

          <button onClick={() => fileInputRef.current.click()}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt,.zip"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {/* 7. EVENTO ONCHANGE ACTUALIZADO (PASO 7) */}
          <input
            value={input}
            onChange={e => {
              setInput(e.target.value)
              socket.emit('typing:start', { conversationId: activeChat, userName: user?.name })
              clearTimeout(window._typingTimeout)
              window._typingTimeout = setTimeout(() => {
                socket.emit('typing:stop', { conversationId: activeChat })
              }, 2000)
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
            placeholder="Escribe un mensaje..."
            style={{
              flex: 1, background: inputBg,
              border: `1px solid ${inputBorder}`,
              borderRadius: '24px', padding: '10px 16px', fontSize: '14px',
              outline: 'none', boxSizing: 'border-box',
              color: dark ? '#f1f5f9' : '#1e293b',
              transition: 'background 0.3s'
            }}
          />
          <button onClick={() => sendMessage(input)}
            style={{
              background: '#3b82f6', color: 'white', border: 'none',
              borderRadius: '50%', width: '40px', height: '40px',
              cursor: 'pointer', fontSize: '18px', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}>➤</button>
        </div>

        <style>{`
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-6px); }
          }
          @keyframes msgIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </>
  )
}