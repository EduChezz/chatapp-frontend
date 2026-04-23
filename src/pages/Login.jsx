import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/chat')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--code-bg)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '8px 12px', fontSize: '14px',
    boxSizing: 'border-box', outline: 'none', color: 'var(--text)'
  }

  return (
     <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '360px', background: 'var(--bg)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>

        <div style={{ background: 'var(--accent)', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h1 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '600', margin: '0 0 4px' }}>ChatApp</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0 }}>Conecta con el mundo</p>
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
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text)', marginBottom: '4px' }}>Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@email.com" required style={inputStyle} />
            </div>

            <div style={{ marginBottom: '6px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required style={inputStyle} />
            </div>

            <div style={{ textAlign: 'right', marginBottom: '20px' }}>
              <span style={{ fontSize: '12px', color: 'var(--accent)', cursor: 'pointer' }}>¿Olvidaste tu contraseña?</span>
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', background: 'var(--accent)', color: '#ffffff',
              border: 'none', borderRadius: '8px', padding: '10px',
              fontSize: '14px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer'
            }}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text)', marginTop: '20px' }}>
            ¿No tienes cuenta?{' '}
            <Link to="/register" style={{ color: 'var(--accent)', fontWeight: '500', textDecoration: 'none' }}>
              Regístrate
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}