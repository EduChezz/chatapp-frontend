export default function ImageViewer({ src, onClose }) {
  if (!src) return null

  // ✨ NUEVO: Función maestra para forzar la descarga de la imagen
  const handleDownload = async (e) => {
    e.stopPropagation(); // Evita que se cierre la foto al hacer clic en descargar
    try {
      // 1. Obtenemos la imagen como datos puros (Blob)
      const response = await fetch(src);
      const blob = await response.blob();
      
      // 2. Creamos una URL temporal invisible en el navegador
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `imagen-${Date.now()}.jpg`; // Le damos un nombre único con la fecha
      
      // 3. Simulamos el clic y limpiamos la memoria
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error al descargar la imagen:", err);
      // Plan B: Si el navegador bloquea la descarga por seguridad, la abrimos en otra pestaña
      window.open(src, '_blank');
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, cursor: 'zoom-out'
      }}
    >
      {/* ✨ NUEVO: Botón de Descarga */}
      <button 
        onClick={handleDownload} 
        title="Descargar imagen"
        style={{
          position: 'absolute', top: '16px', right: '70px', // Lo ponemos al lado del botón de cerrar
          background: 'rgba(255,255,255,0.15)', border: 'none',
          color: 'white', fontSize: '18px', cursor: 'pointer',
          borderRadius: '50%', width: '40px', height: '40px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s hover:scale-110'
        }}
      >
        ⬇️
      </button>

      {/* Botón de Cerrar Original */}
      <button 
        onClick={onClose} 
        title="Cerrar"
        style={{
          position: 'absolute', top: '16px', right: '20px',
          background: 'rgba(255,255,255,0.15)', border: 'none',
          color: 'white', fontSize: '18px', cursor: 'pointer',
          borderRadius: '50%', width: '40px', height: '40px',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        ✕
      </button>
      
      <img
        src={src}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '90vh',
          borderRadius: '12px', objectFit: 'contain',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          cursor: 'default'
        }}
      />
    </div>
  )
}