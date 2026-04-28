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

  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState([])

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

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return
    try {
      const res = await api.post('/conversations', {
        name: groupName,
        is_group: true,
        member_ids: selectedMembers.map(m => m.id),
        color: '#7c3aed' 
      })
      await loadConversations()
      setActiveChat(res.data.id)
      
      setIsCreatingGroup(false)
      setGroupName('')
      setSelectedMembers([])
      setSearch('')
      setSearchResults([])
    } catch (err) {
      console.error("Error creando grupo", err)
    }
  }

  const toggleMemberSelection = (selectedUser) => {
    const isAlreadySelected = selectedMembers.find(m => m.id === selectedUser.id)
    if (isAlreadySelected) {
      setSelectedMembers(prev => prev.filter(m => m.id !== selectedUser.id))
    } else {
      setSelectedMembers([...selectedMembers, selectedUser])
    }
  }

  return (
    <div className="w-80 flex flex-col h-screen border-r transition-colors duration-300 bg-slate-800 dark:bg-slate-900 border-slate-700 dark:border-slate-800">
      
      <div className="p-5 flex items-center justify-between">
        <div onClick={() => setShowProfile(true)} className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity" title="Editar perfil">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: user?.avatar_color || '#3b82f6' }}>
            {user?.name?.substring(0, 2).toUpperCase() || 'U'}
          </div>
          <div>
            <h3 className="text-white m-0 text-sm font-semibold">{user?.name}</h3>
            <p className="text-green-500 m-0 text-xs font-medium">● {user?.status || 'en línea'}</p>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button onClick={toggleTheme} className="p-2 rounded-lg text-white border-none cursor-pointer transition-colors bg-slate-700 dark:bg-slate-800 hover:bg-slate-600 dark:hover:bg-slate-700">
            {dark ? '☀️' : '🌙'}
          </button>
          <button onClick={logout} className="px-3 py-2 rounded-lg cursor-pointer text-xs font-bold transition-colors border-none text-white bg-red-500 hover:bg-red-600">
            Salir
          </button>
        </div>
      </div>

      <div className="px-5 pb-4 flex gap-2">
        <input 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isCreatingGroup ? "Buscar amigos para el grupo..." : "Buscar usuarios..."}
          className="flex-1 px-3.5 py-2.5 rounded-lg border-none text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors bg-slate-700 dark:bg-slate-800 placeholder-slate-400 text-sm"
        />
        <button 
          onClick={() => { setIsCreatingGroup(!isCreatingGroup); setSelectedMembers([]); setGroupName('') }}
          className={`px-3 flex items-center justify-center rounded-lg cursor-pointer transition-colors border-none ${isCreatingGroup ? 'bg-blue-500 text-white' : 'bg-slate-700 dark:bg-slate-800 text-slate-300 hover:bg-slate-600'}`}
          title="Crear Grupo"
        >
          👥
        </button>
      </div>

      {isCreatingGroup && (
        <div className="px-5 pb-4 border-b border-slate-700 dark:border-slate-800">
          <input 
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="Escribe el nombre del grupo..."
            className="w-full px-3.5 py-2 rounded-lg border-none text-sm outline-none bg-slate-900 dark:bg-slate-950 text-white mb-3 focus:ring-1 focus:ring-purple-500"
          />
          
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedMembers.map(m => (
                <span key={m.id} className="bg-purple-600 text-[11px] px-2.5 py-1 rounded-full text-white flex items-center gap-1.5 font-medium shadow-sm">
                  {m.name}
                  <button onClick={() => toggleMemberSelection(m)} className="bg-transparent border-none text-white text-[10px] cursor-pointer hover:text-red-300 flex items-center justify-center leading-none">✕</button>
                </span>
              ))}
            </div>
          )}

          <button 
            onClick={handleCreateGroup}
            disabled={!groupName.trim() || selectedMembers.length === 0}
            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-slate-600 disabled:text-slate-400 text-white border-none py-2 rounded-lg text-sm font-bold cursor-pointer transition-colors shadow-sm"
          >
            Confirmar Grupo
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2.5 custom-scrollbar">
        
        {isCreatingGroup && searchResults.length === 0 ? (
          <div className="p-5 text-center text-slate-400 text-sm mt-8">
            <div className="text-3xl mb-3">🔍</div>
            <p className="font-medium text-white">Busca a tus amigos</p>
            <p className="mt-2 text-xs">Usa la barra de arriba para encontrar usuarios y agregarlos a tu nuevo grupo.</p>
          </div>
        ) : searchResults.length > 0 ? (
          <div>
            <p className="text-slate-400 text-xs px-2.5 mt-2 mb-2.5 font-bold">
              {isCreatingGroup ? 'SELECCIONA USUARIOS' : 'RESULTADOS DE BÚSQUEDA'}
            </p>
            {searchResults.map(u => {
              const isSelected = selectedMembers.find(m => m.id === u.id)
              return (
                <div 
                  key={u.id} 
                  onClick={() => isCreatingGroup ? toggleMemberSelection(u) : startChat(u.id, u.name)}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-1 transition-colors ${isSelected ? 'bg-purple-500/20 border border-purple-500/50' : 'bg-transparent hover:bg-slate-700 dark:hover:bg-slate-800'}`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: u.avatar_color || '#64748b' }}>
                    {u.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h4 className="m-0 text-white text-sm font-semibold">{u.name}</h4>
                    <p className="m-0 text-slate-400 text-xs">
                      {isCreatingGroup ? (isSelected ? 'Seleccionado ✓' : 'Toca para agregar') : 'Toca para chatear'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div>
            <p className="text-slate-400 text-xs px-2.5 mt-2 mb-2.5 font-bold">TUS CHATS</p>
            {contacts?.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => setActiveChat(chat.id)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-1 transition-colors duration-200 ${activeChat === chat.id ? 'bg-blue-500' : 'hover:bg-slate-700 dark:hover:bg-slate-800'}`}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold relative" style={{ backgroundColor: chat.color || '#3b82f6' }}>
                  {chat.name?.substring(0, 2).toUpperCase()}
                  {chat.is_group && <span className="absolute -bottom-1 -right-1 text-xs drop-shadow-md">👥</span>}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="m-0 text-white text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                    {chat.name}
                  </h4>
                  <p className={`m-0 text-xs whitespace-nowrap overflow-hidden text-ellipsis ${activeChat === chat.id ? 'text-blue-200' : 'text-slate-400'}`}>
                    {chat.last_message || 'Inicia la conversación'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  )
}