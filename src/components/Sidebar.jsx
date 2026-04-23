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

  // 1. Cargar las conversaciones
  const loadConversations = async () => {
    try {
      const res = await api.get('/conversations')
      setContacts(res.data)
    } catch (err) {
      console.error("Error cargando chats", err)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [])

  // 2. Buscar usuarios nuevos
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

  // 3. Crear chat nuevo
  const startChat = async (otherUserId, otherUserName) => {
    try {
      const res = await api.post('/conversations', {
        name: otherUserName,
        is_group: false,
        member_ids: [otherUserId]
      })
      await loadConversations()
      setActiveChat(res.data.id)
      setSearch('')
      setSearchResults([])
    } catch (err) {
      console.error("Error creando chat", err)
    }
  }

  return (
    // Contenedor principal con Tailwind (Ancho fijo en PC, adaptable, modo oscuro activo)
    <div className="w-80 flex flex-col h-screen border-r transition-colors duration-300 bg-slate-800 dark:bg-slate-900 border-slate-700 dark:border-slate-800">
      
      {/* Cabecera del usuario */}
      <div className="p-5 flex items-center justify-between">
        <div 
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
          title="Editar perfil"
        >
          {/* Avatar (El color de fondo sí se queda como style porque viene de la BD) */}
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: user?.avatar_color || '#3b82f6' }}
          >
            {user?.name?.substring(0, 2).toUpperCase() || 'U'}
          </div>
          <div>
            <h3 className="text-white m-0 text-sm font-semibold">{user?.name}</h3>
            <p className="text-green-500 m-0 text-xs font-medium">● {user?.status || 'en línea'}</p>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-lg text-white border-none cursor-pointer transition-colors bg-slate-700 dark:bg-slate-800 hover:bg-slate-600 dark:hover:bg-slate-700"
          >
            {dark ? '☀️' : '🌙'}
          </button>
          <button 
            onClick={logout} 
            className="px-3 py-2 rounded-lg cursor-pointer text-xs font-bold transition-colors border-none text-white bg-red-500 hover:bg-red-600"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="px-5 pb-5">
        <input 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar usuarios por nombre..." 
          className="w-full px-3.5 py-2.5 rounded-lg border-none text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors bg-slate-700 dark:bg-slate-800 placeholder-slate-400"
        />
      </div>

      {/* Lista de Resultados / Chats */}
      <div className="flex-1 overflow-y-auto px-2.5 custom-scrollbar">
        
        {searchResults.length > 0 ? (
          <div>
            <p className="text-slate-400 text-xs px-2.5 mb-2.5 font-bold">RESULTADOS DE BÚSQUEDA</p>
            {searchResults.map(u => (
              <div 
                key={u.id} 
                onClick={() => startChat(u.id, u.name)}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-1 transition-colors bg-transparent hover:bg-slate-700 dark:hover:bg-slate-800"
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: u.avatar_color || '#64748b' }}
                >
                  {u.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="m-0 text-white text-sm font-semibold">{u.name}</h4>
                  <p className="m-0 text-slate-400 text-xs">Toca para chatear</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <p className="text-slate-400 text-xs px-2.5 mb-2.5 font-bold">TUS CHATS</p>
            {contacts?.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => setActiveChat(chat.id)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-1 transition-colors duration-200 ${
                  activeChat === chat.id 
                    ? 'bg-blue-500' 
                    : 'hover:bg-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: chat.color || '#3b82f6' }}
                >
                  {chat.name?.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="m-0 text-white text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                    {chat.name}
                  </h4>
                  <p className={`m-0 text-xs whitespace-nowrap overflow-hidden text-ellipsis ${
                    activeChat === chat.id ? 'text-blue-200' : 'text-slate-400'
                  }`}>
                    {chat.last_message || 'Inicia la conversación'}
                  </p>
                </div>
              </div>
            ))}
            
            {(!contacts || contacts.length === 0) && search.length === 0 && (
               <div className="p-5 text-center text-slate-400 text-sm">
                 <p>Aún no tienes chats.</p>
                 <p className="mt-2 text-xs">Usa la barra de arriba para buscar a otros usuarios registrados.</p>
               </div>
            )}
          </div>
        )}
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  )
}