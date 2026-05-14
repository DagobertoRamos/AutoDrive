// =============================================================================
// Root Layout — AutoDrive
// =============================================================================

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'AutoDrive — Sua loja no piloto automático',
    template: '%s | AutoDrive',
  },
  description:
    'AutoDrive — Plataforma profissional de gestão comercial automotiva. Pendências, comissões, notificações e integrações em um só lugar.',
  authors: [{ name: 'AutoDrive' }],
  robots: { index: false, follow: false },
  icons: {
    icon: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  themeColor: '#0F2818',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
