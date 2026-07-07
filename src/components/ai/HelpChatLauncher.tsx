'use client'

// =============================================================================
// HelpChatLauncher — botão flutuante do assistente de ajuda (todas as telas).
// Abre um painel com o HelpChat. Montado no DashboardShell.
// =============================================================================

import { useState } from 'react'
import { Bot, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import HelpChat from './HelpChat'

export default function HelpChatLauncher() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <div className="fixed z-[9998] w-[min(92vw,24rem)] animate-slide-in-right" style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))', right: '1.25rem' }}>
          <HelpChat />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Fechar assistente' : 'Assistente de ajuda'}
        aria-label="Assistente de ajuda"
        className={cn(
          'fixed z-[9998] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-colors',
          open ? 'bg-gray-700 hover:bg-gray-800' : 'bg-brand-600 hover:bg-brand-700',
        )}
        style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))', right: '1.25rem' }}
      >
        {open ? <X size={22} /> : <Bot size={24} />}
      </button>
    </>
  )
}
