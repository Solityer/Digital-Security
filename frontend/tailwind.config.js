/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1e40af',
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        secondary: {
          DEFAULT: '#0891b2',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        accent: {
          DEFAULT: '#059669',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        'bg-dark':   '#0a0e1a',
        'card-dark': '#0f172a',
        'border-dark': '#1e293b',
      },
      backgroundImage: {
        'tech-gradient': 'linear-gradient(135deg, #0a0e1a 0%, #0d1528 50%, #0a0e1a 100%)',
        'card-gradient': 'linear-gradient(135deg, #0f172a 0%, #111827 100%)',
        'header-gradient': 'linear-gradient(90deg, #0a0e1a 0%, #0d1a3a 50%, #0a0e1a 100%)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.4s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(59,130,246,0.4)' },
          '50%':       { boxShadow: '0 0 20px rgba(59,130,246,0.8), 0 0 40px rgba(59,130,246,0.4)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
    },
  },
  plugins: [],
}
