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

  // Escuchar nuevo mensaje para actualizar último mensaje en sidebar
  useEffect(() => {
    socket.on('message:new', (msg) => {
      setConversations(prev => prev.map(c =>
        c.id === msg.conversation_id
          ? { ...c, last_message: msg.content, last_message_time: msg.created_at }
          : c
      ))
    })
    return () => socket.off('message:new')
  }, [])

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