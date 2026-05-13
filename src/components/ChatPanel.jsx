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

  const [showGroupMembers, setShowGroupMembers] = useState(false)
  const [groupMembers, setGroupMembers] = useState([])
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState([])

  const contact = contacts.find(c => c.id === activeChat)
  const messages = allMessages[activeChat] || []

  useEffect(() => { requestNotificationPermission() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, activeChat])

  const markAsRead = async () => {
    if (!activeChat) return
    try {
      await api.put(`/conversations/${activeChat}/read`)
      socket.emit('message:read', { conversationId: activeChat, readerId: user?.id })
    } catch (err) {
      console.error("Error al marcar como leído:", err)
    }
  }

  useEffect(() => {
    if (!activeChat) return
    setIsTyping(false) 
    api.get(`/messages/${activeChat}`).then(res => {
      setAllMessages(prev => ({ ...prev, [activeChat]: res.data }))
      socket.emit('conversation:join', activeChat)
      markAsRead()
    }).catch(err => console.error("Error al cargar mensajes:", err))
  }, [activeChat])

  useEffect(() => {
    const handleNewMsg = (msg) => {
      const isMine = msg.sender_id === user?.id
      // Sincronización en tiempo real: Solo actualizamos si el mensaje es de este chat
      if (msg.conversation_id === activeChat) {
        setAllMessages(prev => ({
          ...prev,
          [activeChat]: [...(prev[activeChat] || []), { ...msg, sent: isMine }]
        }))
        if (!isMine) markAsRead()
      } else if (!isMine) {
        // Notificaciones para chats en segundo plano
        playNotificationSound()
        const senderChat = contacts.find(c => c.id === msg.conversation_id)
        showDesktopNotification(senderChat?.name || 'Nuevo mensaje', msg.content)
      }
    }

    const handleReadUpdate = ({ conversationId }) => {
      if (conversationId === activeChat) {
        setAllMessages(prev => {
          const currentMsgs = prev[conversationId] || []
          return {
            ...prev,
            [conversationId]: currentMsgs.map(m => ({ ...m, read: true }))
          }
        })
      }
    }

    // 🔥 FILTROS DE ESCRITURA: Solo activamos si el ID coincide
    const handleTypingStart = ({ conversationId }) => {
      if (conversationId === activeChat) setIsTyping(true)
    }
    const handleTypingStop = ({ conversationId }) => {
      if (conversationId === activeChat) setIsTyping(false)
    }

    socket.on('message:new', handleNewMsg)
    socket.on('message:read_update', handleReadUpdate)
    socket.on('typing:start', handleTypingStart)
    socket.on('typing:stop', handleTypingStop)

    return () => {
      socket.off('message:new', handleNewMsg)
      socket.off('message:read_update', handleReadUpdate)
      socket.off('typing:start', handleTypingStart)
      socket.off('typing:stop', handleTypingStop)
    }
  }, [activeChat, contact, user, contacts])

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

  const handleShowMembers = async () => {
    setShowGroupMembers(true)
    setIsAddingMember(false)
    setMemberSearch('')
    setGroupMembers([])
    try {
      const res = await api.get(`/conversations/${activeChat}/members`)
      setGroupMembers(res.data)
    } catch (err) {
      console.error("Error cargando integrantes:", err)
    }
  }

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm("¿Seguro que quieres expulsar a este integrante?")) return
    try {
      await api.delete(`/conversations/${activeChat}/members/${memberId}`)
      setGroupMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err) {
      console.error("Error expulsando:", err)
    }
  }

  const handleAddMember = async (userId) => {
    try {
      await api.post(`/conversations/${activeChat}/members`, { userId })
      setMemberSearch('')
      setIsAddingMember(false)
      handleShowMembers() 
    } catch (err) {
      console.error("Error añadiendo integrante:", err)
    }
  }

  if (!activeChat) return null

  return (
    <>
      <ImageViewer src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {showGroupMembers && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={() => setShowGroupMembers(false)}>
          <div className="bg-white dark:bg-slate-800 w-80 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ animation: 'slideUp 0.2s ease', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-purple-600 flex justify-between items-center text-white">
              <h3 className="m-0 font-semibold text-sm">Integrantes</h3>
              <button onClick={() => setShowGroupMembers(false)} className="bg-transparent border-none text-white cursor-pointer">✕</button>
            </div>
            <div className="p-2 overflow-y-auto flex-1 custom-scrollbar">
              {groupMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: m.avatar_color || '#3b82f6' }}>
                      {m.name?.substring(0, 2).toUpperCase()}
                    </div>
                    <p className="m-0 text-sm font-medium text-slate-800 dark:text-slate-100">{m.name}</p>
                  </div>
                  {m.id !== user?.id && (
                    <button onClick={() => handleRemoveMember(m.id)} className="bg-red-100 text-red-600 border-none px-2 py-1 rounded text-[11px] font-bold cursor-pointer">Expulsar</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        <div className="px-5 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-medium shadow-sm" style={{ backgroundColor: contact?.color || '#3b82f6' }}>
              {contact?.name?.substring(0, 2).toUpperCase() || '?'}
            </div>
            <div>
              <p className="m-0 font-medium text-sm text-slate-800 dark:text-slate-100">
                {contact?.name || 'Chat'}
                {contact?.is_group && <span className="ml-1.5 text-xs text-purple-600 font-bold">👥 Grupo</span>}
              </p>
              <p className={`m-0 text-xs ${isTyping ? 'text-blue-500 font-medium' : 'text-slate-500'}`}>
                {isTyping ? '✏️ escribiendo...' : (contact?.status || 'en línea')}
              </p>
            </div>
          </div>
          {contact?.is_group && (
            <button onClick={handleShowMembers} className="px-3 py-1.5 bg-purple-100 text-purple-600 rounded-lg text-xs font-bold border-none cursor-pointer">👥 Integrantes</button>
          )}
        </div>

        <div onClick={() => { setShowEmojis(false); setShowReactions(null) }} className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2 custom-scrollbar">
          <div className="flex-1 min-h-[20px]"></div>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sent ? 'justify-end' : 'justify-start'}`} onMouseEnter={() => setHoveredMsg(msg.id)} onMouseLeave={() => { setHoveredMsg(null); setShowReactions(null) }}>
              <div className="relative max-w-[65%]">
                {msg.type === 'image' ? (
                  <div onClick={() => setLightboxSrc(msg.content)} className={`overflow-hidden cursor-zoom-in border border-slate-200 dark:border-slate-700 shadow-sm ${msg.sent ? 'rounded-[18px_18px_4px_18px]' : 'rounded-[18px_18px_18px_4px]'}`}>
                    <img src={msg.content} alt="img" className="block max-w-[220px] max-h-[200px] object-cover" />
                  </div>
                ) : msg.type === 'file' ? (
                  <a href={msg.content} target="_blank" rel="noreferrer" className="no-underline">
                    <div className={`px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm ${msg.sent ? 'bg-blue-500 text-white rounded-[18px_18px_4px_18px]' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px]'}`}>
                      <span className="text-2xl">📎</span>
                      <div>
                        <p className="m-0 text-[13px] font-medium">{msg.file_name}</p>
                        <p className={`m-0 text-[11px] ${msg.sent ? 'text-blue-100' : 'text-slate-500'}`}>{msg.file_size} · Descargar</p>
                      </div>
                    </div>
                  </a>
                ) : (
                  <div className={`px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${msg.sent ? 'bg-blue-500 text-white rounded-[18px_18px_4px_18px]' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px]'}`}>
                    {!msg.sent && contact?.is_group && <div className="text-[11px] font-bold mb-1" style={{ color: msg.sender_color || '#3b82f6' }}>{msg.sender_name}</div>}
                    <p className="m-0 mb-1">{msg.content}</p>
                    <p className={`m-0 text-[10px] text-right flex items-center justify-end gap-1 ${msg.sent ? 'text-blue-100' : 'text-slate-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.sent && <span className={`text-[12px] ${msg.read ? 'text-blue-300 font-bold' : 'text-blue-100'}`}>{msg.read ? '✓✓' : '✓'}</span>}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px] px-4 py-3 flex gap-1 items-center shadow-sm">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-[6px] h-[6px] rounded-full bg-slate-400 inline-block" style={{ animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {showEmojis && (
          <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-2 flex flex-wrap gap-2">
            {EMOJIS.map(e => <button key={e} onClick={() => setInput(prev => prev + e)} className="bg-transparent border-none text-[20px] cursor-pointer p-1 hover:scale-110 transition-transform">{e}</button>)}
          </div>
        )}

        <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <button onClick={() => setShowEmojis(!showEmojis)} className="bg-transparent border-none text-[20px] cursor-pointer p-1">😊</button>
          <button onClick={() => fileInputRef.current.click()} className="bg-transparent border-none text-[18px] cursor-pointer p-1 text-slate-500">📎</button>
          <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
          <input value={input} onChange={e => {
            setInput(e.target.value)
            socket.emit('typing:start', { conversationId: activeChat, userName: user?.name })
            clearTimeout(window._t)
            window._t = setTimeout(() => socket.emit('typing:stop', { conversationId: activeChat }), 2000)
          }} onKeyDown={e => e.key === 'Enter' && sendMessage(input)} placeholder="Escribe un mensaje..." className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm outline-none text-slate-800 dark:text-slate-100" />
          <button onClick={() => sendMessage(input)} className="bg-blue-500 hover:bg-blue-600 text-white border-none rounded-full w-9 h-9 cursor-pointer flex items-center justify-center transition-colors">➤</button>
        </div>
      </div>
      <style>{`
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  )
}