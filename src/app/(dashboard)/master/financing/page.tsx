'use client'

// =============================================================================
// Master > F&I — hub técnico (estrutura Fase 3). MASTER-only.
// Provedores, bancos homologados, adapters, mapeamentos, webhooks, logs e saúde
// das integrações. NÃO cadastra credenciais da loja (isso é da loja, em
// /configuracoes/fi). Persistência real depende dos models (Fase 4) + migration.
// =============================================================================

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Boxes, Landmark, Plug, GitCompareArrows, Webhook, ScrollText, Activity, ToggleRight, Lock } from 'lucide-react'

const AREAS = [
  { href: '/master/financing/providers', title: 'Provedores F&I', desc: 'Credere, banco direto e integradores.', icon: Boxes },
  { href: '/master/financing/banks', title: 'Bancos Homologados', desc: 'Bancos suportados e capacidades.', icon: Landmark },
  { href: '/master/financing/adapters', title: 'Adaptadores de API', desc: 'Adapters por provedor.', icon: Plug },
  { href: '/master/financing/mappings', title: 'Mapeamento de Campos', desc: 'De/para com a API do banco.', icon: GitCompareArrows },
  { href: '/master/financing/webhooks', title: 'Webhooks', desc: 'Eventos de retorno.', icon: Webhook },
  { href: '/master/financing/logs', title: 'Logs Técnicos', desc: 'Histórico das integrações.', icon: ScrollText },
  { href: '/master/financing/health', title: 'Saúde das Integrações', desc: 'Status e erros.', icon: Activity },
  { href: '/master/financing/flags', title: 'Feature Flags F&I', desc: 'Ativar/desativar integrações.', icon: ToggleRight },
]

export default function MasterFinancingHub() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  if (session && role && role !== 'MASTER') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">F&amp;I — Painel técnico</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((a) => (
          <Link key={a.href} href={a.href} className="group rounded-xl border border-gray-200 bg-white p-4 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/30">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><a.icon size={18} /></div>
            <p className="font-semibold text-gray-900 group-hover:text-brand-800">{a.title}</p>
            <p className="mt-0.5 text-xs text-gray-500">{a.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
