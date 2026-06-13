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
        /* ATTENDX Monochrome Palette — works in both modes */
        brand: {
          50:  '#F5F7FA',
          100: '#E8ECF1',
          200: '#D4D8DE',
          300: '#A7AFBC',
          400: '#8D96A5',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2630',
          900: '#161B22',
          950: '#0E1117',
        },
        surface: {
          50:  '#F0F2F5',
          100: '#E4E7EB',
          200: '#D1D5DB',
          300: '#A9B0BC',
          400: '#5A6577',
          500: '#3D4A5C',
          600: '#2D3748',
          700: '#1E293B',
          800: '#141B27',
          900: '#0F172A',
          950: '#020617',
        },
        accent: {
          50:  '#f8f9fb',
          100: '#e8ecf1',
          200: '#d4d8de',
          300: '#a7afbc',
          400: '#8d96a5',
          500: '#6e7a8a',
          600: '#505b6b',
          700: '#3a4453',
          800: '#2a3240',
          900: '#1c2430',
          950: '#0e1520',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 10s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'particle': 'particle 15s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(141, 150, 165, 0.08)' },
          '50%': { boxShadow: '0 0 40px rgba(141, 150, 165, 0.15)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        particle: {
          '0%': { transform: 'translateY(100vh) rotate(0deg)', opacity: '0' },
          '10%': { opacity: '0.5' },
          '90%': { opacity: '0.3' },
          '100%': { transform: 'translateY(-100vh) rotate(720deg)', opacity: '0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
