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
        'glow-gold':    '0 0 20px rgb(var(--c-secondary) / 0.22)',
        'glow-gold-sm': '0 0 10px rgb(var(--c-secondary) / 0.18)',
        'glow-primary': '0 0 18px rgb(var(--c-primary) / 0.22)',
        'card':         '0 1px 2px rgb(var(--c-shadow) / 0.08)',
      },
      fontFamily: {
        // Archivo: dáng rộng, công nghiệp — đúng chất áp phích in khổ lớn.
        // Be Vietnam Pro: thiết kế riêng cho tiếng Việt, dấu cân ở mọi cỡ chữ.
        // IBM Plex Mono: số liệu thật (chỉ số ô, kích thước, DPI).
        display: ['Archivo', 'system-ui', 'sans-serif'],
        outfit:  ['Archivo', 'system-ui', 'sans-serif'],
        sans:    ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
        inter:   ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
        mono:    ['IBM Plex Mono', 'ui-monospace', 'monospace'],
        fira:    ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      animation: {
        'spin-slow':  'spin 12s linear infinite',
        'fadeIn':     'fadeIn 0.35s ease-out both',
        'vinyl-spin': 'spin 12s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
