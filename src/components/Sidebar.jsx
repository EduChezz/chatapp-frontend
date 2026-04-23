import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import ProfileModal from './ProfileModal'
import api from '../services/api'

export default function Sidebar({ activeChat, setActiveChat, contacts, setContacts }) {
  const { dark, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showProfile, setShowProfile] = useState(false)

  // 1. Cargar las conversaciones reales desde PostgreSQL
  const loadConversations = async () => {
    try {
      const res = await api.get('/conversations')
      setContacts(res.data) // Le pasa los chats reales al ChatPanel
    } catch (err) {
      console.error("Error cargando chats", err)
    }
  }

  // Cargar al inicio
  useEffect(() => {
    loadConversations()
  }, [])

  // 2. Buscar usuarios nuevos cuando escribes en la barra
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/conversations/users/search?q=${search}`)
        setSearchResults(res.data)
      } catch (err) {
        console.error("Error buscando usuarios", err)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  // 3. Crear un chat nuevo al hacer clic en un resultado
  const startChat = async (otherUserId, otherUserName) => {
    try {
      const res = await api.post('/conversations', {
        name: otherUserName,
        is_group: false,
        member_ids: [otherUserId]
      })
      await loadConversations() // Recarga la lista
      setActiveChat(res.data.id) // Abre el chat inmediatamente
      setSearch('')
      setSearchResults([])
    } catch (err) {
      console.error("Error creando chat", err)
    }
  }

  // Estilos de la barra lateral
  const bgSidebar = dark ? '#0f172a' : '#1e293b'
  const bgItem = dark ? '#1e293b' : '#334155'
  const textMuted = '#94a3b8'

  return (
    <div style={{ width: '320px', background: bgSidebar, display: 'flex', flexDirection: 'column', height: '100vh', borderRight: `1px solid ${dark ? '#1e293b' : '#0f172a'}` }}>
      
      {/* Cabecera del usuario (Tu perfil) */}
      <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div 
          onClick={() => setShowProfile(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          title="Editar perfil"
        >
          <div style={{ 
            width: '40px', height: '40px', borderRadius: '50%', 
            background: user?.avatar_color || '#3b82f6', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            color: 'white', fontWeight: 'bold' 
          }}>
            {user?.name?.substring(0, 2).toUpperCase() || 'U'}
          </div>
          <div>
            <h3 style={{ color: 'white', margin: 0, fontSize: '15px' }}>{user?.name}</h3>
            <p style={{ color: '#22c55e', margin: 0, fontSize: '12px' }}>● {user?.status || 'en línea'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={toggleTheme} style={{ background: bgItem, border: 'none', color: 'white', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>
            {dark ? '☀️' : '🌙'}
          </button>
          <button onClick={logout} style={{ background: '#ef4444', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
            Salir
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div style={{ padding: '0 20px 20px' }}>
        <input 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar usuarios por nombre..." 
          style={{ 
            width: '100%', padding: '10px 14px', borderRadius: '8px', 
            border: 'none', background: bgItem, color: 'white', outline: 'none',
            boxSizing: 'border-box'
          }} 
        />
      </div>

      {/* Lista de Resultados de Búsqueda o Chats Guardados */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px' }}>
        
        {searchResults.length > 0 ? (
          <div>
            <p style={{ color: textMuted, fontSize: '12px', padding: '0 10px', margin: '0 0 10px', fontWeight: 'bold' }}>RESULTADOS DE BÚSQUEDA</p>
            {searchResults.map(u => (
              <div 
                key={u.id} 
                onClick={() => startChat(u.id, u.name)}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', 
                  borderRadius: '12px', cursor: 'pointer', marginBottom: '4px', background: 'transparent'
                }}
                onMouseEnter={e => e.currentTarget.style.background = bgItem}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: u.avatar_color || '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                  {u.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 style={{ margin: 0, color: 'white', fontSize: '14px' }}>{u.name}</h4>
                  <p style={{ margin: 0, color: textMuted, fontSize: '12px' }}>Toca para chatear</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <p style={{ color: textMuted, fontSize: '12px', padding: '0 10px', margin: '0 0 10px', fontWeight: 'bold' }}>TUS CHATS</p>
            {contacts?.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => setActiveChat(chat.id)}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', 
                  borderRadius: '12px', cursor: 'pointer', marginBottom: '4px',
                  background: activeChat === chat.id ? '#3b82f6' : 'transparent',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => { if(activeChat !== chat.id) e.currentTarget.style.background = bgItem }}
                onMouseLeave={e => { if(activeChat !== chat.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: chat.color || '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                  {chat.name?.substring(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <h4 style={{ margin: 0, color: 'white', fontSize: '14px', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{chat.name}</h4>
                  <p style={{ margin: 0, color: activeChat === chat.id ? '#bfdbfe' : textMuted, fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {chat.last_message || 'Inicia la conversación'}
                  </p>
                </div>
              </div>
            ))}
            
            {(!contacts || contacts.length === 0) && search.length === 0 && (
               <div style={{ padding: '20px', textAlign: 'center', color: textMuted, fontSize: '13px' }}>
                 <p>Aún no tienes chats.</p>
                 <p>Usa la barra de arriba para buscar a otros usuarios registrados.</p>
               </div>
            )}
          </div>
        )}
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  )
}