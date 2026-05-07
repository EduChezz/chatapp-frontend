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

  // Carga inicial y unión a salas de socket
  const loadConversations = async () => {
    try {
      const res = await api.get('/conversations')
      setConversations(res.data)
      
      // Nos unimos a todos los canales para escuchar notificaciones de fondo
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

  // ÚNICO ESCUCHA: Reordenamiento, punto rojo y resurrección de chats
  useEffect(() => {
    const handleNewMessage = (msg) => {
      setConversations(prev => {
        const chatExists = prev.find(c => c.id === msg.conversation_id)

        // Si el chat no está en la lista (fue eliminado), recargamos para que aparezca
        if (!chatExists) {
          loadConversations()
          return prev
        }

        const updatedChats = prev.map(c => {
          if (c.id === msg.conversation_id) {
            const isMine = msg.sender_id === user?.id
            const isCurrentChat = c.id === activeChat
            
            let newUnreadCount = c.unread_count || 0
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

        // Ordenar: el más reciente arriba de todo
        return updatedChats.sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0))
      })
    }

    socket.on('message:new', handleNewMessage)
    return () => socket.off('message:new', handleNewMessage)
  }, [activeChat, user])

  // Limpiar contador al entrar al chat
  useEffect(() => {
    if (activeChat) {
      setConversations(prev => prev.map(c => 
        c.id === activeChat ? { ...c, unread_count: 0 } : c
      ))
    }
  }, [activeChat])

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm("¿Eliminar este chat?")) return;
    try {
      await api.delete(`/conversations/${chatId}`);
      setConversations(prev => prev.filter(c => c.id !== chatId));
      if (activeChat === chatId) setActiveChat(null);
    } catch (err) {
      console.error("Error al eliminar:", err);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Cargando...</div>

  return (
    <div className="flex h-screen bg-slate-900">
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
        : <div className="flex-1 flex flex-col items-center justify-center text-slate-500">💬 Selecciona un chat para empezar</div>
      }
    </div>
  )
}