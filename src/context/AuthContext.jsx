import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'
import socket from '../services/socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Al montar, recupera sesión guardada
  useEffect(() => {
    const token = localStorage.getItem('token')
    const saved = localStorage.getItem('user')
    if (token && saved) {
      setUser(JSON.parse(saved))
      socket.connect()
      socket.emit('user:join', JSON.parse(saved).id)
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { token, user } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    setUser(user)
    socket.connect()
    socket.emit('user:join', user.id)
    return user
  }

  const register = async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password })
    const { token, user } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    setUser(user)
    socket.connect()
    socket.emit('user:join', user.id)
    return user
  }

  const updateProfile = async (data) => {
    const res = await api.put('/auth/profile', data)
    const updated = { ...user, ...res.data }
    localStorage.setItem('user', JSON.stringify(updated))
    setUser(updated)
    return updated
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    socket.disconnect()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateProfile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}