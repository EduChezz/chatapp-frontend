/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Vinculamos Tailwind con tus variables CSS
        'accent': 'var(--accent)',
        'text-main': 'var(--text)',
        'text-h': 'var(--text-h)',
        'bg-main': 'var(--bg)',
        'border-custom': 'var(--border)',
      }
    },
  },
  plugins: [],
}

