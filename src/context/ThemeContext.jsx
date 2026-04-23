import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  // Inicializamos leyendo el localStorage
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    // 1. Guardamos la preferencia
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    
    // 2. LA MAGIA PARA TAILWIND: Agregamos o quitamos la clase 'dark' en el HTML
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  // Cambié toggleDark a toggleTheme para que coincida con el Sidebar
  return (
    <ThemeContext.Provider value={{ dark, toggleTheme: () => setDark(p => !p) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}