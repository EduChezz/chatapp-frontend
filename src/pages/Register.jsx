import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(name, email, password)
      navigate('/chat')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '8px', padding: '8px 12px', fontSize: '14px',
    boxSizing: 'border-box', outline: 'none'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '360px', background: '#ffffff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>

        <div style={{ background: '#2563eb', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h1 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '600', margin: '0 0 4px' }}>ChatApp</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0 }}>Crea tu cuenta</p>
        </div>

        <div style={{ padding: '24px' }}>
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px', padding: '10px 12px',
              fontSize: '13px', color: '#dc2626', marginBottom: '16px'
            }}>{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Nombre completo</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre" required style={inputStyle} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@email.com" required style={inputStyle} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6} style={inputStyle} />
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', background: loading ? '#93c5fd' : '#2563eb', color: '#ffffff',
              border: 'none', borderRadius: '8px', padding: '10px',
              fontSize: '14px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer'
            }}>
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '13px', color: '#6b7280', marginTop: '20px' }}>
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" style={{ color: '#2563eb', fontWeight: '500', textDecoration: 'none' }}>
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}