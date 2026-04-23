import { useState, useRef, useEffect } from 'react'
import ImageViewer from './ImageViewer'
import { useTheme } from '../context/ThemeContext'
import { playNotificationSound, requestNotificationPermission, showDesktopNotification } from '../utils/notify'
import api from '../services/api'
import socket from '../services/socket'
import { useAuth } from '../context/AuthContext'

const EMOJIS = ['😀','😂','❤️','🔥','👍','😮','😢','🎉','🙏','💯']
const REACTIONS = ['❤️','😂','👍','😮','😢','🔥']

export default function ChatPanel({ activeChat, contacts }) {
  const { dark } = useTheme()
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

  useEffect(() => { requestNotificationPermission() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, activeChat])

  useEffect(() => {
    if (!activeChat) return
    api.get(`/messages/${activeChat}`).then(res => {
      setAllMessages(prev => ({ ...prev, [activeChat]: res.data }))
      socket.emit('conversation:join', activeChat)
    }).catch(err => console.error("Error al cargar mensajes:", err))
  }, [activeChat])

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

  const sendMessage = (text, type = 'text', extra = {}) => {
    if (type === 'text' && !text.trim()) return
    socket.emit('message:send', {
      conversationId: activeChat, senderId: user?.id, content: text,
      type, fileName: extra.fileName || null, fileSize: extra.fileSize || null,
    })
    setInput('')
    setShowEmojis(false)
    socket.emit('typing:stop', { conversationId: activeChat })
  }

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

  if (!activeChat) return null

  return (
    <>
      <ImageViewer src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      <div className="flex-1 flex flex-col h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        
        {/* Header */}
        <div className="px-5 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 transition-colors duration-300">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-medium"
               style={{ backgroundColor: contact?.color || '#3b82f6' }}>
            {contact?.name?.substring(0, 2).toUpperCase() || '?'}
          </div>
          <div>
            <p className="m-0 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors">
              {contact?.name || 'Chat'}
              {contact?.is_group && <span className="ml-1.5 text-xs text-purple-600 dark:text-purple-400">👥 Grupo</span>}
            </p>
            <p className={`m-0 text-xs transition-colors ${isTyping ? 'text-blue-500' : 'text-slate-500 dark:text-slate-400'}`}>
              {isTyping ? '✏️ escribiendo...' : (contact?.status || 'en línea')}
            </p>
          </div>
        </div>

        {/* Área de mensajes */}
        <div onClick={() => { setShowEmojis(false); setShowReactions(null) }}
             className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-slate-50 dark:bg-slate-900 transition-colors duration-300 custom-scrollbar">
          {messages.map((msg) => (
            <div key={msg.id}
                 className={`flex ${msg.sent ? 'justify-end' : 'justify-start'}`}
                 style={{ animation: 'msgIn 0.2s cubic-bezier(0.19,1,0.22,1)' }}
                 onMouseEnter={() => setHoveredMsg(msg.id)}
                 onMouseLeave={() => { setHoveredMsg(null); setShowReactions(null) }}>
              
              <div className="relative max-w-[65%]">
                
                {/* Botón reacción */}
                {hoveredMsg === msg.id && (
                  <button onClick={e => { e.stopPropagation(); setShowReactions(showReactions === msg.id ? null : msg.id) }}
                          className={`absolute -top-2.5 ${msg.sent ? '-left-2.5' : '-right-2.5'} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full w-[26px] h-[26px] cursor-pointer text-[13px] z-10 flex items-center justify-center shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}>
                    😊
                  </button>
                )}

                {/* Picker de reacciones */}
                {showReactions === msg.id && (
                  <div onClick={e => e.stopPropagation()}
                       className={`absolute -top-[46px] ${msg.sent ? 'left-0' : 'right-0'} bg-white dark:bg-slate-800 rounded-full px-2.5 py-1.5 flex gap-1.5 shadow-lg border border-slate-200 dark:border-slate-700 z-20`}
                       style={{ animation: 'slideUp 0.2s cubic-bezier(0.19,1,0.22,1)' }}>
                    {REACTIONS.map(emoji => (
                      <button key={emoji} onClick={() => addReaction(msg.id, emoji)}
                              className="bg-transparent border-none cursor-pointer text-lg p-0.5 hover:scale-110 transition-transform">
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Burbuja — imagen */}
                {msg.type === 'image' ? (
                  <div onClick={() => setLightboxSrc(msg.content)}
                       className={`overflow-hidden cursor-zoom-in border border-slate-200 dark:border-slate-700 shadow-sm ${msg.sent ? 'rounded-[18px_18px_4px_18px]' : 'rounded-[18px_18px_18px_4px]'}`}>
                    <img src={msg.content} alt="img" className="block max-w-[220px] max-h-[200px] object-cover" />
                  </div>
                ) : msg.type === 'file' ? (
                  /* Burbuja — archivo */
                  <a href={msg.content} target="_blank" rel="noreferrer" className="no-underline">
                    <div className={`px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm cursor-pointer transition-colors ${msg.sent ? 'bg-blue-500 border-none rounded-[18px_18px_4px_18px]' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px]'}`}>
                      <span className="text-2xl">📎</span>
                      <div>
                        <p className={`m-0 text-[13px] font-medium ${msg.sent ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>{msg.file_name}</p>
                        <p className={`m-0 text-[11px] ${msg.sent ? 'text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>{msg.file_size} · Descargar</p>
                      </div>
                    </div>
                  </a>
                ) : (
                  /* Burbuja — texto */
                  <div className={`px-3.5 py-2.5 text-sm leading-relaxed shadow-sm transition-colors ${msg.sent ? 'bg-blue-500 text-white rounded-[18px_18px_4px_18px] border-none' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px]'}`}>
                    {!msg.sent && <div className="text-[12px] font-bold mb-1" style={{ color: msg.sender_color || '#3b82f6' }}>{msg.sender_name}</div>}
                    <p className="m-0 mb-1">{msg.content}</p>
                    <p className={`m-0 text-[11px] text-right flex items-center justify-end gap-1 ${msg.sent ? 'text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      {msg.sent && <span className={`text-[13px] ${msg.read ? 'text-blue-400' : 'text-blue-200'}`}>{msg.read ? '✓✓' : '✓'}</span>}
                    </p>
                  </div>
                )}

                {/* Reacciones */}
                {msg.reactions?.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${msg.sent ? 'justify-end' : 'justify-start'}`}>
                    {msg.reactions.map(r => (
                      <span key={r.emoji} onClick={() => addReaction(msg.id, r.emoji)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-1.5 py-0.5 text-xs cursor-pointer shadow-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
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
            <div className="flex justify-start">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px] px-4 py-3 flex gap-1 items-center shadow-sm">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-[7px] h-[7px] rounded-full bg-slate-400 dark:bg-slate-500 inline-block"
                        style={{ animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Emoji picker */}
        {showEmojis && (
          <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-2.5 flex flex-wrap gap-2 transition-colors duration-300">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setInput(prev => prev + e)}
                      className="bg-transparent border-none text-[22px] cursor-pointer p-1 hover:scale-110 transition-transform">
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Barra de input */}
        <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 transition-colors duration-300">
          <button onClick={() => setShowEmojis(p => !p)}
                  className="bg-transparent border-none text-[22px] cursor-pointer p-1 hover:scale-110 transition-transform leading-none">😊</button>
          <button onClick={() => fileInputRef.current.click()}
                  className="bg-transparent border-none text-[20px] cursor-pointer p-1 hover:scale-110 transition-transform leading-none text-slate-500 dark:text-slate-400">📎</button>
          
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.zip" onChange={handleFileChange} className="hidden" />
          
          <input
            value={input}
            onChange={e => {
              setInput(e.target.value)
              socket.emit('typing:start', { conversationId: activeChat, userName: user?.name })
              clearTimeout(window._typingTimeout)
              window._typingTimeout = setTimeout(() => socket.emit('typing:stop', { conversationId: activeChat }), 2000)
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-100 transition-colors duration-300 placeholder-slate-400 dark:placeholder-slate-500"
          />
          <button onClick={() => sendMessage(input)}
                  className="bg-blue-500 hover:bg-blue-600 text-white border-none rounded-full w-10 h-10 cursor-pointer text-lg flex items-center justify-center transition-colors shadow-sm">
            ➤
          </button>
        </div>

        <style>{`
          @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
          @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    </>
  )
}