'use client'

// =============================================================================
// Comunicação > Central — hub da comunicação da loja. Atalhos para Disparo,
// Templates, Avisos, Logs e Relatórios + contagem de avisos ativos.
// =============================================================================

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Inbox, Send, LayoutTemplate, Megaphone, ScrollText, BarChart3 } from 'lucide-react'

const CARDS = [
  { href: '/comunicacao/disparo', title: 'Disparo', desc: 'Enviar mensagens (WhatsApp/e-mail).', icon: Send },
  { href: '/comunicacao/templates', title: 'Templates', desc: 'Modelos de mensagem reutilizáveis.', icon: LayoutTemplate },
  { href: '/comunicacao/avisos', title: 'Avisos', desc: 'Comunicados da plataforma para a loja.', icon: Megaphone },
  { href: '/comunicacao/logs', title: 'Logs', desc: 'Histórico de envios e entregas.', icon: ScrollText },
  { href: '/relatorios/comunicacao/whatsapp', title: 'Relatórios', desc: 'WhatsApp, e-mail, avisos e logs.', icon: BarChart3 },
]

export default function CentralComunicacaoPage() {
  const [avisos, setAvisos] = useState<number | null>(null)
  useEffect(() => {
    fetch('/api/internal-notices/active', { credentials: 'include' })
      .then((r) => r.json()).then((j) => setAvisos((j?.data ?? []).length)).catch(() => setAvisos(null))
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Inbox size={20} className="text-brand-600" />Central de Comunicação</h1>
        <p className="mt-0.5 text-sm text-gray-500">Disparos, templates, avisos e histórico de comunicação da loja.</p>
      </div>

      {avisos !== null && avisos > 0 && (
        <Link href="/comunicacao/avisos" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 hover:bg-amber-100">
          <Megaphone size={16} className="shrink-0" /><span>Você tem <strong>{avisos}</strong> aviso(s) ativo(s) da plataforma — toque para ver.</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-xl border border-gray-200 bg-white p-4 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/30">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><c.icon size={18} /></div>
            <p className="font-semibold text-gray-900 group-hover:text-brand-800">{c.title}</p>
            <p className="mt-0.5 text-xs text-gray-500">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
