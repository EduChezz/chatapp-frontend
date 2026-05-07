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

  // ✨ NUEVO: Escuchar mensajes para reordenar y poner el puntito rojo
  useEffect(() => {
    const handleNewMessage = (msg) => {
      setConversations(prev => {
        const updatedChats = prev.map(c => {
          if (c.id === msg.conversation_id) {
            // Verificamos si el mensaje es nuestro o del otro
            const isMine = msg.sender_id === user?.id
            // Verificamos si estamos dentro de este chat actualmente
            const isCurrentChat = c.id === activeChat
            
            // Si el mensaje no es mío y NO estoy en ese chat, sumamos 1 al contador
            let newUnreadCount = c.unread_count || 0
            if (!isMine && !isCurrentChat) {
              newUnreadCount += 1
            }

            // Cambiamos el texto si es imagen o archivo
            let previewText = msg.content
            if (msg.type === 'image') previewText = '📷 Imagen'
            if (msg.type === 'file') previewText = '📎 Archivo'

            return { 
              ...c, 
              last_message: previewText, 
              last_message_time: msg.created_at,
              unread_count: newUnreadCount // Guardamos el nuevo contador
            }
          }
          return c
        })

        // 🔥 Magia: Reordenamos la lista para que el chat más reciente suba al primer lugar
        return updatedChats.sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0))
      })
    }

    socket.on('message:new', handleNewMessage)
    return () => socket.off('message:new', handleNewMessage)
  }, [activeChat, user]) // Se actualiza si cambiamos de chat

  // ✨ NUEVO: Quitar el puntito rojo (poner en 0) cuando entramos a un chat
  useEffect(() => {
    if (activeChat) {
      setConversations(prev => prev.map(c => 
        c.id === activeChat ? { ...c, unread_count: 0 } : c
      ))
    }
  }, [activeChat])

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