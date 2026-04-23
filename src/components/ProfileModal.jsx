import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'


const AVATAR_COLORS = ['#3b82f6','#7c3aed','#db2777','#ea580c','#16a34a','#0891b2']
const STATUSES = ['en línea','ocupado','ausente','no molestar']

export default function ProfileModal({ onClose }) {
  const { user, updateProfile } = useAuth()
  const { dark } = useTheme()
  const [name, setName] = useState(user?.name || '')
  const [bio, setBio] = useState(user?.bio || '')
  const [color, setColor] = useState(user?.color || '#3b82f6')
  const [status, setStatus] = useState(user?.status || 'en línea')

  const bg = dark ? '#1e293b' : 'white'
  const text = dark ? '#f1f5f9' : '#1e293b'
  const subtle = dark ? '#94a3b8' : '#64748b'
  const inputBg = dark ? '#0f172a' : '#f8fafc'
  const border = dark ? '#334155' : '#e2e8f0'

  const initials = name.trim().split(' ').map(w => w[0]?.toUpperCase()).slice(0, 2).join('') || 'TU'

  const save = async () => {
    try {
      await updateProfile({
        name,
        bio,
        avatar_color: color,
        status
      })
      onClose()
    } catch (err) {
      console.error('Error actualizando perfil:', err)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: bg, borderRadius: '20px', padding: '28px',
        width: '340px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        animation: 'slideUp 0.25s cubic-bezier(0.19,1,0.22,1)'
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '17px', color: text }}>Mi perfil</h3>

        {/* Avatar preview */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%', background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '24px', fontWeight: '600',
            boxShadow: `0 0 0 4px ${color}33`
          }}>{initials}</div>
        </div>

        {/* Color avatar */}
        <label style={{ fontSize: '12px', color: subtle }}>Color de avatar</label>
        <div style={{ display: 'flex', gap: '8px', margin: '8px 0 16px' }}>
          {AVATAR_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{
              width: '28px', height: '28px', borderRadius: '50%', background: c,
              border: color === c ? `3px solid ${text}` : '3px solid transparent',
              cursor: 'pointer', transition: 'border 0.15s'
            }} />
          ))}
        </div>

        {/* Nombre */}
        <label style={{ fontSize: '12px', color: subtle }}>Nombre</label>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{
            width: '100%', marginTop: '6px', marginBottom: '14px',
            background: inputBg, border: `1px solid ${border}`,
            borderRadius: '8px', padding: '10px 12px', fontSize: '14px',
            color: text, outline: 'none', boxSizing: 'border-box'
          }} />

        {/* Bio */}
        <label style={{ fontSize: '12px', color: subtle }}>Bio</label>
        <input value={bio} onChange={e => setBio(e.target.value)}
          placeholder="Ej: Disponible para chatear"
          style={{
            width: '100%', marginTop: '6px', marginBottom: '14px',
            background: inputBg, border: `1px solid ${border}`,
            borderRadius: '8px', padding: '10px 12px', fontSize: '14px',
            color: text, outline: 'none', boxSizing: 'border-box'
          }} />

        {/* Estado */}
        <label style={{ fontSize: '12px', color: subtle }}>Estado</label>
        <div style={{ display: 'flex', gap: '6px', margin: '8px 0 20px', flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{
              padding: '5px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              border: status === s ? 'none' : `1px solid ${border}`,
              background: status === s ? '#3b82f6' : inputBg,
              color: status === s ? 'white' : subtle,
              fontWeight: status === s ? '500' : '400'
            }}>{s}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{
            flex: 1, background: inputBg, border: `1px solid ${border}`,
            borderRadius: '10px', padding: '10px', cursor: 'pointer',
            fontSize: '14px', color: subtle
          }}>Cancelar</button>
          <button onClick={save} style={{
            flex: 1, background: '#3b82f6', border: 'none',
            borderRadius: '10px', padding: '10px', cursor: 'pointer',
            fontSize: '14px', color: 'white', fontWeight: '500'
          }}>Guardar</button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(30px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
    </div>
  )
}