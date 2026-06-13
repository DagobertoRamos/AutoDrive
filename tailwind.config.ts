import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'
import forms      from '@tailwindcss/forms'

// =============================================================================
// AutoDrive — Tailwind CSS Configuration
// Paleta verde escuro premium + neutros profissionais
// =============================================================================

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // ── Paleta principal AutoDrive — usa CSS vars para suporte a temas ──
        // Os valores RGB são definidos em globals.css e sobrescritos dinamicamente
        // pelo ThemeInjector com base na cor salva em SystemSetting.
        brand: {
          DEFAULT: 'rgb(var(--brand-800) / <alpha-value>)',
          50:      'rgb(var(--brand-50)  / <alpha-value>)',
          100:     'rgb(var(--brand-100) / <alpha-value>)',
          200:     'rgb(var(--brand-200) / <alpha-value>)',
          300:     'rgb(var(--brand-300) / <alpha-value>)',
          400:     'rgb(var(--brand-400) / <alpha-value>)',
          500:     'rgb(var(--brand-500) / <alpha-value>)',
          600:     'rgb(var(--brand-600) / <alpha-value>)',
          700:     'rgb(var(--brand-700) / <alpha-value>)',
          800:     'rgb(var(--brand-800) / <alpha-value>)',
          900:     'rgb(var(--brand-900) / <alpha-value>)',
          950:     'rgb(var(--brand-950) / <alpha-value>)',
        },
        // Sidebar — usa CSS vars geradas pelo ThemeInjector a partir da cor primária
        sb: {
          bg:          'var(--sb-bg)',
          hover:       'var(--sb-hover)',
          active:      'var(--sb-active)',
          accent:      'var(--sb-accent)',
          border:      'var(--sb-border)',
          'accent-dim':'var(--sb-accent-dim)',
        },
        // Accent (laranja apenas para alertas críticos)
        accent: {
          DEFAULT: '#EA580C',
          50:  '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          950: '#431A05',
          foreground: '#FFFFFF',
        },
        // Design system base
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',
        // Status semântico
        success: { DEFAULT: '#16A34A', light: '#DCFCE7', foreground: '#FFFFFF' },
        warning: { DEFAULT: '#D97706', light: '#FEF3C7', foreground: '#FFFFFF' },
        error:   { DEFAULT: '#DC2626', light: '#FEE2E2', foreground: '#FFFFFF' },
        info:    { DEFAULT: '#2563EB', light: '#DBEAFE', foreground: '#FFFFFF' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card:     '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.08)',
        'card-hover': '0 4px 12px -1px rgba(0,0,0,0.12), 0 2px 4px -2px rgba(0,0,0,0.1)',
        sidebar:  '2px 0 12px rgba(0,0,0,0.20)',
        modal:    '0 20px 60px rgba(0,0,0,0.25)',
        toast:    '0 4px 24px rgba(0,0,0,0.12)',
        'brand':  '0 4px 14px rgba(22,101,52,0.30)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to:   { opacity: '0', transform: 'translateY(4px)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          from: { transform: 'translateX(0)' },
          to:   { transform: 'translateX(100%)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to:   { transform: 'translateX(0)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-brand': {
          '0%':   { boxShadow: '0 0 0 0 rgba(22,197,94,0.5)' },
          '70%':  { boxShadow: '0 0 0 10px rgba(22,197,94,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(22,197,94,0)' },
        },
        'bounce-in': {
          '0%':   { transform: 'scale(0.9)', opacity: '0' },
          '50%':  { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-in':        'fade-in 0.2s ease-out',
        'fade-out':       'fade-out 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-out-right':'slide-out-right 0.3s ease-out',
        'slide-in-left':  'slide-in-left 0.3s ease-out',
        'shimmer':        'shimmer 2s linear infinite',
        'pulse-brand':    'pulse-brand 2s ease-in-out infinite',
        'bounce-in':      'bounce-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
      screens: {
        xs: '475px',
      },
    },
  },
  plugins: [
    typography,
    forms({ strategy: 'class' }),
  ],
} satisfies Config

export default config
