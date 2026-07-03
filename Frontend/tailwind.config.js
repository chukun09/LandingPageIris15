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
        brand: {
          bg:            'rgb(var(--c-bg) / <alpha-value>)',
          bgDeep:        'rgb(var(--c-bg-deep) / <alpha-value>)',
          card:          'rgb(var(--c-card) / <alpha-value>)',
          surface:       'rgb(var(--c-surface) / <alpha-value>)',
          surfaceHover:  'rgb(var(--c-surface-hover) / <alpha-value>)',
          primary:       'rgb(var(--c-primary) / <alpha-value>)',
          secondary:     'rgb(var(--c-secondary) / <alpha-value>)',
          accent:        'rgb(var(--c-accent) / <alpha-value>)',
          success:       'rgb(var(--c-success) / <alpha-value>)',
          danger:        'rgb(var(--c-danger) / <alpha-value>)',
          textPrimary:   'rgb(var(--c-text-1) / <alpha-value>)',
          textSecondary: 'rgb(var(--c-text-2) / <alpha-value>)',
          textMuted:     'rgb(var(--c-text-3) / <alpha-value>)',
          border:        'rgb(var(--c-border) / <alpha-value>)',
        }
      },
      boxShadow: {
        'glow-gold':    '0 0 24px rgb(var(--c-secondary) / 0.28), 0 0 64px rgb(var(--c-secondary) / 0.10)',
        'glow-gold-sm': '0 0 12px rgb(var(--c-secondary) / 0.22)',
        'glow-primary': '0 0 24px rgb(var(--c-primary) / 0.30)',
        'card':         '0 1px 3px rgb(0 0 0 / 0.06), 0 8px 24px rgb(var(--c-shadow) / 0.10)',
      },
      fontFamily: {
        outfit: ['Plus Jakarta Sans', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        fira: ['Fira Code', 'monospace'],
      },
      animation: {
        'spin-slow':   'spin 12s linear infinite',
        'shimmer':     'shimmer 3.2s linear infinite',
        'aurora':      'aurora 24s ease-in-out infinite alternate',
        'float-slow':  'floatY 9s ease-in-out infinite',
        'fadeIn':      'fadeIn 0.4s ease-out both',
        'vinyl-spin':  'spin 12s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
        floatY: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-14px)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        aurora: {
          '0%':   { transform: 'translate(0,0) scale(1)' },
          '50%':  { transform: 'translate(6vw,-4vh) scale(1.15)' },
          '100%': { transform: 'translate(-4vw,3vh) scale(0.95)' },
        },
      },
    },
  },
  plugins: [],
}
