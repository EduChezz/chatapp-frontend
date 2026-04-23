export default function ImageViewer({ src, onClose }) {
  if (!src) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, cursor: 'zoom-out'
      }}
    >
      <button onClick={onClose} style={{
        position: 'absolute', top: '16px', right: '20px',
        background: 'rgba(255,255,255,0.15)', border: 'none',
        color: 'white', fontSize: '24px', cursor: 'pointer',
        borderRadius: '50%', width: '40px', height: '40px'
      }}>✕</button>
      <img
        src={src}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '90vh',
          borderRadius: '12px', objectFit: 'contain',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}
      />
    </div>
  )
}