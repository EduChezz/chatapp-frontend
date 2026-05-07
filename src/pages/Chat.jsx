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

  // Cargar conversaciones del backend
  const loadConversations = async () => {
    try {
      const res = await api.get('/conversations')
      setConversations(res.data)
      
      // 🔥 LA MAGIA: Nos unimos a TODOS los chats en segundo plano para escuchar notificaciones
      res.data.forEach(chat => {
        socket.emit('conversation:join', chat.id)
      })

      if (res.data.length > 0 && !activeChat) {
        setActiveChat(res.data[0].id)
      }
    } catch (err) {
      console.error('Error cargando conversaciones:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [])

  // Escuchar mensajes para reordenar la lista y poner el puntito rojo
  useEffect(() => {
    const handleNewMessage = (msg) => {
      setConversations(prev => {
        const updatedChats = prev.map(c => {
          if (c.id === msg.conversation_id) {
            const isMine = msg.sender_id === user?.id
            const isCurrentChat = c.id === activeChat
            
            let newUnreadCount = c.unread_count || 0
            // Si el mensaje es de la otra persona y NO estamos viendo ese chat, suma 1 al contador
            if (!isMine && !isCurrentChat) {
              newUnreadCount += 1
            }

            let previewText = msg.content
            if (msg.type === 'image') previewText = '📷 Imagen'
            if (msg.type === 'file') previewText = '📎 Archivo'

            return { 
              ...c, 
              last_message: previewText, 
              last_message_time: msg.created_at,
              unread_count: newUnreadCount
            }
          }
          return c
        })

        // Reordenar los chats (el más reciente arriba tipo WhatsApp)
        return updatedChats.sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0))
      })
    }

    socket.on('message:new', handleNewMessage)
    return () => socket.off('message:new', handleNewMessage)
  }, [activeChat, user])

  // Quitar el puntito rojo cuando entramos a un chat
  useEffect(() => {
    if (activeChat) {
      setConversations(prev => prev.map(c => 
        c.id === activeChat ? { ...c, unread_count: 0 } : c
      ))
    }
  }, [activeChat])

  // Función para eliminar el chat completamente
  const handleDeleteChat = async (chatId) => {
    const confirmDelete = window.confirm("¿Seguro que quieres eliminar este chat? Se borrarán todos los mensajes.");
    if (!confirmDelete) return;

    try {
      await api.delete(`/conversations/${chatId}`);
      setConversations(prev => prev.filter(c => c.id !== chatId));
      if (activeChat === chatId) {
        setActiveChat(null);
      }
    } catch (err) {
      console.error("Error al eliminar chat:", err);
      alert("Hubo un problema al intentar eliminar el chat.");
    }
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
      Cargando conversaciones...
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <Sidebar
        activeChat={activeChat}
        setActiveChat={setActiveChat}
        contacts={conversations}
        setContacts={setConversations}
        onConversationCreated={loadConversations}
        onDeleteChat={handleDeleteChat} 
      />
      {activeChat
        ? <ChatPanel activeChat={activeChat} contacts={conversations} />
        : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <span className="text-5xl">💬</span>
            <p className="m-0 text-[15px]">Selecciona una conversación</p>
          </div>
        )
      }
    </div>
  )
}