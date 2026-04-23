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
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', fontSize: '14px', color: '#64748b'
    }}>
      Cargando conversaciones...
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f8fafc' }}>
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
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px', color: '#94a3b8'
          }}>
            <span style={{ fontSize: '48px' }}>💬</span>
            <p style={{ margin: 0, fontSize: '15px' }}>Selecciona una conversación</p>
          </div>
        )
      }
    </div>
  )
}