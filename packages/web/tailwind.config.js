/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          0: 'rgb(var(--s0) / <alpha-value>)',
          1: 'rgb(var(--s1) / <alpha-value>)',
          2: 'rgb(var(--s2) / <alpha-value>)',
          3: 'rgb(var(--s3) / <alpha-value>)',
        },
        border: 'var(--border)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dim: 'rgba(80, 190, 210, 0.85)',
          glow: 'rgba(80, 200, 220, 0.15)',
        },
        muted: 'var(--muted)',
        subtle: 'var(--subtle)',
      },
    },
  },
  plugins: [],
}
