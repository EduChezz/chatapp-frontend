import { useState, useRef, useEffect } from 'react'
import ImageViewer from './ImageViewer'
import { useTheme } from '../context/ThemeContext'
import { playNotificationSound, requestNotificationPermission, showDesktopNotification } from '../utils/notify'
import api from '../services/api'
import socket from '../services/socket'
import { useAuth } from '../context/AuthContext'

const EMOJIS = ['😀','😂','❤️','🔥','👍','😮','😢','🎉','🙏','💯']
const REACTIONS = ['❤️','😂','👍','😮','😢','🔥']

export default function ChatPanel({ activeChat, contacts, setActiveChat }) {
  const { dark } = useTheme()
  const { user } = useAuth()
  const [allMessages, setAllMessages] = useState({})
  const [input, setInput] = useState('')
  const [showEmojis, setShowEmojis] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [showReactions, setShowReactions] = useState(null)
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [editingMsg, setEditingMsg] = useState(null)
  const [editInput, setEditInput] = useState('')
  const [openMenu, setOpenMenu] = useState(null)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  // Estados del Grupo
  const [showGroupMembers, setShowGroupMembers] = useState(false)
  const [groupMembers, setGroupMembers] = useState([])
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState([])

  // ✨ NUEVO: Estados y Refs para la grabadora de voz
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)

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
    if (!memberSearch.trim()) {
      setMemberSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/conversations/users/search?q=${memberSearch}`)
        const existingIds = groupMembers.map(m => m.id)
        setMemberSearchResults(res.data.filter(u => !existingIds.includes(u.id)))
      } catch (err) {
        console.error("Error buscando usuarios", err)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [memberSearch, groupMembers])

  useEffect(() => {
    const handleNewMsg = (msg) => {
      const isMine = msg.sender_id === user?.id
      if (msg.conversation_id === activeChat) {
        setAllMessages(prev => ({
          ...prev,
          [activeChat]: [...(prev[activeChat] || []), { ...msg, sent: isMine }]
        }))
        if (!isMine) markAsRead()
      } else if (!isMine) {
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

    const handleTypingStart = ({ conversationId }) => {
      if (conversationId === activeChat) setIsTyping(true)
    }
    const handleTypingStop = ({ conversationId }) => {
      if (conversationId === activeChat) setIsTyping(false)
    }

    const handleReactionAdd = ({ messageId, emoji }) => {
      setAllMessages(prev => {
        const currentMsgs = prev[activeChat] || []
        return {
          ...prev,
          [activeChat]: currentMsgs.map(m => {
            if (m.id !== messageId) return m
            const reactions = m.reactions || []
            const exists = reactions.find(r => r.emoji === emoji)
            const newReactions = exists
              ? reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r)
              : [...reactions, { emoji, count: 1 }]
            return { ...m, reactions: newReactions }
          })
        }
      })
    }

    socket.on('message:new', handleNewMsg)
    socket.on('message:read_update', ({ conversationId }) => {
      if (conversationId === activeChat) {
        setAllMessages(prev => {
          const currentMsgs = prev[conversationId] || []
          return {
            ...prev,
            [conversationId]: currentMsgs.map(m => ({ ...m, read: true }))
          }
        })
      }
    })

    socket.on('message:read_update', handleReadUpdate)
    // ✨ ESCUCHA PARA EDICIÓN: Actualiza el texto en la pantalla al instante
    socket.on('message:edit', ({ messageId, newContent }) => {
      setAllMessages(prev => {
        const chatMsgs = prev[activeChat] || []
        return {
          ...prev,
          [activeChat]: chatMsgs.map(m => m.id === messageId ? { ...m, content: newContent, edited: true } : m)
        }
      })
    })

    // ✨ ESCUCHA PARA ELIMINACIÓN: Cambia el globo por el aviso de "eliminado"
    socket.on('message:delete', ({ messageId }) => {
      setAllMessages(prev => {
        const chatMsgs = prev[activeChat] || []
        return {
          ...prev,
          [activeChat]: chatMsgs.map(m => m.id === messageId ? { ...m, content: '🚫 Este mensaje fue eliminado', type: 'deleted' } : m)
        }
      })
    })
    socket.on('typing:start', handleTypingStart)
    socket.on('typing:stop', handleTypingStop)
    socket.on('reaction:add', handleReactionAdd)

    return () => {
      socket.off('message:new', handleNewMsg)
      socket.off('message:read_update', handleReadUpdate)
      socket.off('typing:start', handleTypingStart)
      socket.off('typing:stop', handleTypingStop)
      socket.off('reaction:add', handleReactionAdd)
      socket.off('message:edit')
      socket.off('message:delete')
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

  // ✨ NUEVO: Funciones de Grabación de Voz
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop()) // Apagamos el micrófono
        
        if (!mediaRecorderRef.current.cancel) {
          const file = new File([audioBlob], `audio-${Date.now()}.webm`, { type: 'audio/webm' })
          const formData = new FormData()
          formData.append('file', file)
          try {
            const res = await api.post('/upload', formData)
            const { url, fileName, fileSize } = res.data
            // Enviamos con type: 'audio'
            sendMessage(url, 'audio', { fileName, fileSize })
          } catch (err) {
            console.error('Error subiendo audio:', err)
          }
        }
      }

      mediaRecorderRef.current.cancel = false
      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingTime(0)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

    } catch (err) {
      console.error('Error al acceder al micrófono:', err)
      alert('Por favor permite el acceso al micrófono en tu navegador para grabar audios.')
    }
  }

  const stopRecording = (cancel = false) => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.cancel = cancel
      mediaRecorderRef.current.stop()
      clearInterval(timerRef.current)
      setIsRecording(false)
      setRecordingTime(0)
    }
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }
  // ✨ FIN: Funciones de Grabación

  const addReaction = (msgId, emoji) => {
    socket.emit('reaction:add', { conversationId: activeChat, messageId: msgId, emoji, userId: user?.id })
    setShowReactions(null)
  }

  const handleShowMembers = async () => {
    setShowGroupMembers(true); setIsAddingMember(false); setMemberSearch(''); setGroupMembers([])
    try {
      const res = await api.get(`/conversations/${activeChat}/members`)
      setGroupMembers(res.data)
    } catch (err) { console.error("Error cargando integrantes:", err) }
  }

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm("¿Seguro que quieres expulsar a este integrante?")) return
    try {
      await api.delete(`/conversations/${activeChat}/members/${memberId}`)
      setGroupMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err) { console.error("Error expulsando:", err) }
  }

  const handleAddMember = async (userId) => {
    try {
      await api.post(`/conversations/${activeChat}/members`, { userId })
      setMemberSearch(''); setIsAddingMember(false); handleShowMembers() 
    } catch (err) { console.error("Error añadiendo integrante:", err) }
  }
  // ✨ NUEVO: Funciones para Editar y Eliminar
  const startEdit = (msg) => {
    setEditingMsg(msg.id)
    setEditInput(msg.content)
    setOpenMenu(null)
  }

  const cancelEdit = () => {
    setEditingMsg(null)
    setEditInput('')
  }

  const saveEdit = (msgId) => {
    if (!editInput.trim()) return
    socket.emit('message:edit', { messageId: msgId, conversationId: activeChat, newContent: editInput })
    setEditingMsg(null)
  }

  const deleteMessage = (msgId) => {
    if (window.confirm("¿Seguro que quieres eliminar este mensaje para todos?")) {
      socket.emit('message:delete', { messageId: msgId, conversationId: activeChat })
      setOpenMenu(null)
    }
  }

  if (!activeChat) return null

  return (
    <>
      <ImageViewer src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {/* Modal de miembros del grupo */}
      {showGroupMembers && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={() => setShowGroupMembers(false)}>
          <div className="bg-white dark:bg-slate-800 w-80 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ animation: 'slideUp 0.2s ease', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-purple-600 flex justify-between items-center text-white">
              <h3 className="m-0 font-semibold text-sm">Integrantes</h3>
              <button onClick={() => setShowGroupMembers(false)} className="bg-transparent border-none text-white cursor-pointer hover:scale-110 transition-transform">✕</button>
            </div>
            
            <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              {!isAddingMember ? (
                <button onClick={() => setIsAddingMember(true)} className="w-full py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 font-bold text-sm rounded-lg border-none cursor-pointer transition-colors">
                  + Añadir Integrante
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input 
                      autoFocus
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Buscar por nombre..."
                      className="flex-1 px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-purple-500"
                    />
                    <button onClick={() => { setIsAddingMember(false); setMemberSearch('') }} className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 border-none px-3 rounded-md text-xs font-bold cursor-pointer transition-colors">Cancelar</button>
                  </div>
                  {memberSearch && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md max-h-32 overflow-y-auto shadow-sm custom-scrollbar">
                      {memberSearchResults.length === 0 ? (
                         <p className="text-xs text-slate-500 p-2 text-center m-0">No se encontraron usuarios nuevos.</p>
                      ) : (
                        memberSearchResults.map(u => (
                          <div key={u.id} onClick={() => handleAddMember(u.id)} className="flex items-center gap-2 p-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: u.avatar_color || '#3b82f6' }}>{u.name.substring(0,2).toUpperCase()}</div>
                            <p className="m-0 text-xs font-medium text-slate-800 dark:text-slate-200 flex-1">{u.name}</p>
                            <span className="text-xs text-purple-600 dark:text-purple-400 font-bold">Añadir</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-2 overflow-y-auto flex-1 custom-scrollbar">
              {groupMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: m.avatar_color || '#3b82f6' }}>{m.name?.substring(0, 2).toUpperCase()}</div>
                    <p className="m-0 text-sm font-medium text-slate-800 dark:text-slate-100">{m.name} {m.id === user?.id && <span className="text-xs text-purple-500">(Tú)</span>}</p>
                  </div>
                  {m.id !== user?.id && <button onClick={() => handleRemoveMember(m.id)} className="bg-red-100 text-red-600 border-none px-2 py-1 rounded text-[11px] font-bold cursor-pointer hover:bg-red-200">Expulsar</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300 min-w-0">
        {/* Header */}
        <div className="px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveChat(null)} className="md:hidden p-1 mr-1 bg-transparent border-none text-slate-600 dark:text-slate-300 text-2xl cursor-pointer hover:scale-110 transition-transform leading-none">←</button>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-medium shadow-sm shrink-0" style={{ backgroundColor: contact?.color || '#3b82f6' }}>{contact?.name?.substring(0, 2).toUpperCase() || '?'}</div>
            <div className="overflow-hidden">
              <p className="m-0 font-medium text-sm text-slate-800 dark:text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">{contact?.name || 'Chat'}{contact?.is_group && <span className="ml-1.5 text-xs text-purple-600 font-bold">👥 Grupo</span>}</p>
              <p className={`m-0 text-xs ${isTyping ? 'text-blue-500 font-medium' : 'text-slate-500'}`}>{isTyping ? '✏️ escribiendo...' : (contact?.status || 'en línea')}</p>
            </div>
          </div>
          {contact?.is_group && <button onClick={handleShowMembers} className="px-3 py-1.5 bg-purple-100 text-purple-600 hover:bg-purple-200 rounded-lg text-xs font-bold border-none cursor-pointer transition-colors shrink-0">👥 Integrantes</button>}
        </div>

        {/* Zona de Mensajes */}
        <div onClick={() => { setShowEmojis(false); setShowReactions(null) }} className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2 custom-scrollbar">
          <div className="flex-1 min-h-[20px]"></div>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sent ? 'justify-end' : 'justify-start'}`} onMouseEnter={() => setHoveredMsg(msg.id)} onMouseLeave={() => { setHoveredMsg(null); setShowReactions(null) }}>
              <div className="relative max-w-[85%] sm:max-w-[65%]">
                
                {hoveredMsg === msg.id && (
                  <button onClick={e => { e.stopPropagation(); setShowReactions(showReactions === msg.id ? null : msg.id) }} className={`absolute -top-2.5 ${msg.sent ? '-left-2.5' : '-right-2.5'} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full w-[26px] h-[26px] cursor-pointer text-[13px] z-10 flex items-center justify-center shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}>😊</button>
                )}

                {showReactions === msg.id && (
                  <div onClick={e => e.stopPropagation()} className={`absolute -top-[46px] ${msg.sent ? 'right-0' : 'left-0'} bg-white dark:bg-slate-800 rounded-full px-2.5 py-1.5 flex gap-1.5 shadow-lg border border-slate-200 dark:border-slate-700 z-20`} style={{ animation: 'slideUp 0.2s ease' }}>
                    {REACTIONS.map(emoji => <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="bg-transparent border-none cursor-pointer text-lg p-0.5 hover:scale-110 transition-transform">{emoji}</button>)}
                  </div>
                )}

                {/* ✨ NUEVO: Renderizado del Reproductor de Audio */}
                {msg.type === 'audio' ? (
                  <div className={`px-3 py-2 flex flex-col shadow-sm text-left ${msg.sent ? 'bg-blue-500 text-white rounded-[18px_18px_4px_18px]' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px]'}`}>
                    {!msg.sent && <div className="text-[11px] font-bold mb-1 ml-1" style={{ color: msg.sender_color || '#3b82f6' }}>{msg.sender_name}</div>}
                    <audio controls src={msg.content} className="max-w-[200px] sm:max-w-[250px] h-10 outline-none rounded-full" />
                    <p className={`m-0 mt-1 text-[10px] flex justify-end items-center gap-1 ${msg.sent ? 'text-blue-100' : 'text-slate-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.sent && <span className={`text-[12px] ${msg.read ? 'text-blue-300 font-bold' : 'text-blue-100'}`}>{msg.read ? '✓✓' : '✓'}</span>}
                    </p>
                  </div>
                ) : msg.type === 'image' ? (
                  <div className="flex flex-col">
                    {!msg.sent && <span className="text-[11px] font-bold mb-1 ml-1" style={{ color: msg.sender_color || '#3b82f6' }}>{msg.sender_name}</span>}
                    <div onClick={() => setLightboxSrc(msg.content)} className={`overflow-hidden cursor-zoom-in border border-slate-200 dark:border-slate-700 shadow-sm ${msg.sent ? 'rounded-[18px_18px_4px_18px]' : 'rounded-[18px_18px_18px_4px]'}`}>
                      <img src={msg.content} alt="img" className="block max-w-[220px] max-h-[200px] object-cover" />
                    </div>
                  </div>
                ) : msg.type === 'file' ? (
                  <div className="flex flex-col">
                    {!msg.sent && <span className="text-[11px] font-bold mb-1 ml-1" style={{ color: msg.sender_color || '#3b82f6' }}>{msg.sender_name}</span>}
                    <a href={msg.content} target="_blank" rel="noreferrer" className="no-underline">
                      <div className={`px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm text-left ${msg.sent ? 'bg-blue-500 text-white rounded-[18px_18px_4px_18px]' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px]'}`}>
                        <span className="text-2xl">📎</span>
                        <div className="overflow-hidden">
                          <p className="m-0 text-[13px] font-medium whitespace-nowrap overflow-hidden text-ellipsis">{msg.file_name}</p>
                          <p className={`m-0 text-[11px] ${msg.sent ? 'text-blue-100' : 'text-slate-500'}`}>{msg.file_size} · Descargar</p>
                        </div>
                      </div>
                    </a>
                  </div>
                ) : (
                  <div className={`group relative px-3.5 py-2.5 text-sm leading-relaxed shadow-sm text-left ${msg.sent ? 'bg-blue-500 text-white rounded-[18px_18px_4px_18px]' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px]'}`} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {!msg.sent && <div className="text-[11px] font-bold mb-1" style={{ color: msg.sender_color || '#3b82f6' }}>{msg.sender_name}</div>}
                    
                    {/* 1. BOTÓN DE TRES PUNTOS (Aparece al pasar el mouse) */}
                    {msg.sent && msg.type !== 'deleted' && editingMsg !== msg.id && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === msg.id ? null : msg.id) }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-transparent border-none text-white cursor-pointer p-1 text-lg leading-none transition-opacity"
                      >
                        ⋮
                      </button>
                    )}

                    {/* 2. MENÚ DESPLEGABLE */}
                    {openMenu === msg.id && (
                      <div className="absolute right-0 top-8 bg-white dark:bg-slate-700 shadow-xl rounded-lg py-1 z-50 border border-slate-200 dark:border-slate-600 w-32">
                        <button onClick={() => startEdit(msg)} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-600 bg-transparent border-none text-xs text-slate-700 dark:text-slate-200 cursor-pointer">✏️ Editar</button>
                        <button onClick={() => deleteMessage(msg.id)} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-600 bg-transparent border-none text-xs text-red-500 cursor-pointer">🗑️ Eliminar</button>
                      </div>
                    )}

                    {/* 3. LÓGICA DE EDICIÓN O TEXTO NORMAL */}
                    {editingMsg === msg.id ? (
                      <div className="flex flex-col gap-2">
                        <input 
                          autoFocus
                          value={editInput}
                          onChange={(e) => setEditInput(e.target.value)}
                          className="w-full p-1 text-sm rounded border-none outline-none text-slate-800"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={cancelEdit} className="text-[10px] bg-white/20 border-none text-white px-2 py-1 rounded cursor-pointer">Cancelar</button>
                          <button onClick={() => saveEdit(msg.id)} className="text-[10px] bg-white text-blue-500 font-bold border-none px-2 py-1 rounded cursor-pointer shadow-sm">Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="m-0 mb-1 text-left">{msg.content}</p>
                        <p className={`m-0 text-[10px] flex justify-end items-center gap-1 ${msg.sent ? 'text-blue-100' : 'text-slate-400'}`}>
                          {msg.edited && <span className="italic mr-1">(editado)</span>}
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {msg.sent && <span className={`text-[12px] ${msg.read ? 'text-blue-300 font-bold' : 'text-blue-100'}`}>{msg.read ? '✓✓' : '✓'}</span>}
                        </p>
                      </>
                    )}
                  </div>
                )}
                
                {msg.reactions?.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${msg.sent ? 'justify-end' : 'justify-start'}`}>
                    {msg.reactions.map(r => <span key={r.emoji} onClick={() => addReaction(msg.id, r.emoji)} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-1.5 py-0.5 text-xs cursor-pointer shadow-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">{r.emoji} {r.count}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[18px_18px_18px_4px] px-4 py-3 flex gap-1 items-center shadow-sm">
                {[0, 1, 2].map(i => <span key={i} className="w-[6px] h-[6px] rounded-full bg-slate-400 inline-block" style={{ animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }} />)}
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

        {/* ✨ NUEVO: Barra de envío con la UI de Grabación */}
        <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
          {!isRecording ? (
            <>
              <button onClick={() => setShowEmojis(!showEmojis)} className="bg-transparent border-none text-[20px] cursor-pointer p-1">😊</button>
              <button onClick={() => fileInputRef.current.click()} className="bg-transparent border-none text-[18px] cursor-pointer p-1 text-slate-500">📎</button>
              <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
              
              <input 
                value={input} 
                onChange={e => {
                  setInput(e.target.value)
                  socket.emit('typing:start', { conversationId: activeChat, userName: user?.name })
                  clearTimeout(window._t)
                  window._t = setTimeout(() => socket.emit('typing:stop', { conversationId: activeChat }), 2000)
                }} 
                onKeyDown={e => e.key === 'Enter' && input.trim() && sendMessage(input)} 
                placeholder="Escribe un mensaje..." 
                className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm outline-none text-slate-800 dark:text-slate-100" 
              />
              
              {input.trim() ? (
                <button onClick={() => sendMessage(input)} className="bg-blue-500 hover:bg-blue-600 text-white border-none rounded-full w-9 h-9 cursor-pointer flex items-center justify-center transition-colors">➤</button>
              ) : (
                <button onClick={startRecording} title="Grabar audio" className="bg-green-500 hover:bg-green-600 text-white border-none rounded-full w-9 h-9 cursor-pointer flex items-center justify-center transition-colors">🎤</button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => stopRecording(true)} title="Cancelar audio" className="bg-red-100 text-red-500 hover:bg-red-200 border-none rounded-full w-9 h-9 cursor-pointer flex items-center justify-center transition-colors">✖️</button>
              
              <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-full px-4 py-2 flex items-center gap-2 justify-between">
                <span className="text-red-500 font-medium text-sm flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
                  Grabando...
                </span>
                <span className="text-red-500 font-mono text-sm">{formatTime(recordingTime)}</span>
              </div>
              
              <button onClick={() => stopRecording(false)} title="Enviar audio" className="bg-green-500 hover:bg-green-600 text-white border-none rounded-full w-9 h-9 cursor-pointer flex items-center justify-center transition-colors">➤</button>
            </>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  )
}