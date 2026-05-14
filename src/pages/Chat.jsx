import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import ChatPanel from '../components/ChatPanel'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import socket from '../services/socket'

export default function Chat() {
  const { user } = useAuth()
  const [activeChat, setActiveChat] = useState(null)
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  const loadConversations = async () => {
    try {
      const res = await api.get('/conversations')
      setConversations(res.data)
      // Nos unimos a TODOS los chats en segundo plano
      res.data.forEach(chat => { socket.emit('conversation:join', chat.id) })
      
      // 🔥 IMPORTANTE: Ya NO seleccionamos el primer chat automáticamente al inicio.
      // Esto es clave para que en el celular siempre empieces viendo la lista de chats.
    } catch (err) {
      console.error('Error cargando conversaciones:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadConversations() }, [])

  useEffect(() => {
    const handleNewMessage = (msg) => {
      setConversations(prev => {
        const chatExists = prev.find(c => c.id === msg.conversation_id)
        if (!chatExists) { loadConversations(); return prev; }

        const updatedChats = prev.map(c => {
          if (c.id === msg.conversation_id) {
            const isMine = msg.sender_id === user?.id
            const isCurrentChat = c.id === activeChat
            let newUnreadCount = c.unread_count || 0
            if (!isMine && !isCurrentChat) newUnreadCount += 1

            let previewText = msg.content
            if (msg.type === 'image') previewText = '📷 Imagen'
            if (msg.type === 'file') previewText = '📎 Archivo'

            return { ...c, last_message: previewText, last_message_time: msg.created_at, unread_count: newUnreadCount }
          }
          return c
        })
        return updatedChats.sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0))
      })
    }
    socket.on('message:new', handleNewMessage)
    return () => socket.off('message:new', handleNewMessage)
  }, [activeChat, user])

  useEffect(() => {
    if (activeChat) {
      setConversations(prev => prev.map(c => c.id === activeChat ? { ...c, unread_count: 0 } : c))
    }
  }, [activeChat])

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm("¿Seguro que quieres eliminar este chat? Se borrarán todos los mensajes.")) return;
    try {
      await api.delete(`/conversations/${chatId}`);
      setConversations(prev => prev.filter(c => c.id !== chatId));
      if (activeChat === chatId) setActiveChat(null);
    } catch (err) { console.error("Error al eliminar chat:", err); }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-sm text-slate-500 dark:text-slate-400">Cargando...</div>

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300 overflow-hidden">
      
      {/* 🔥 MAGIA RESPONSIVE: Sidebar */}
      {/* Si hay un chat activo, se oculta en celular ('hidden'). Si no hay chat, ocupa el 100% ('w-full'). En PC siempre mide 320px ('md:w-80') */}
      <div className={`${activeChat ? 'hidden md:flex md:w-80' : 'flex w-full md:w-80'} h-full border-r border-slate-200 dark:border-slate-800 shrink-0`}>
        <Sidebar
          activeChat={activeChat}
          setActiveChat={setActiveChat}
          contacts={conversations}
          setContacts={setConversations}
          onConversationCreated={loadConversations}
          onDeleteChat={handleDeleteChat} 
        />
      </div>

      {/* 🔥 MAGIA RESPONSIVE: ChatPanel */}
      {/* Si NO hay chat activo, se oculta en celular. Si lo hay, se muestra. En PC siempre se muestra. */}
      <div className={`flex-1 ${!activeChat ? 'hidden md:flex' : 'flex'} h-full min-w-0`}>
        {activeChat
          // Pasamos setActiveChat como propiedad (prop) para poder usar el botón de "Atrás" después
          ? <ChatPanel activeChat={activeChat} contacts={conversations} setActiveChat={setActiveChat} />
          : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900">
              <span className="text-5xl">💬</span>
              <p className="m-0 text-[15px]">Selecciona una conversación</p>
            </div>
          )
        }
      </div>
    </div>
  )
}