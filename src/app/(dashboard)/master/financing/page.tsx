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
  { href: '/master/financing/providers', title: 'Provedores F&I', desc: 'Credere, banco direto, integradores — cadastro global.', icon: Boxes },
  { href: '/master/financing/banks', title: 'Bancos Homologados', desc: 'Bancos suportados e capabilities (simulação, envio, retorno).', icon: Landmark },
  { href: '/master/financing/adapters', title: 'Adaptadores de API', desc: 'Configuração técnica dos adapters por provedor.', icon: Plug },
  { href: '/master/financing/mappings', title: 'Mapeamento de Campos', desc: 'De/para entre dados do AutoDrive e a API do banco.', icon: GitCompareArrows },
  { href: '/master/financing/webhooks', title: 'Webhooks', desc: 'Endpoints, assinatura e validação de retorno.', icon: Webhook },
  { href: '/master/financing/logs', title: 'Logs Técnicos', desc: 'Histórico técnico das integrações (sem segredos).', icon: ScrollText },
  { href: '/master/financing/health', title: 'Saúde das Integrações', desc: 'Status, fila, retentativas e erros.', icon: Activity },
  { href: '/master/financing/flags', title: 'Feature Flags F&I', desc: 'Ativar/desativar integrações globalmente.', icon: ToggleRight },
]

export default function MasterFinancingHub() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  if (session && role && role !== 'MASTER') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">A configuração técnica do F&amp;I (provedores, adapters, webhooks) é da plataforma. A loja configura seus bancos e credenciais em Configurações &gt; F&amp;I.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">F&amp;I — Painel técnico (MASTER)</h1>
        <p className="mt-0.5 text-sm text-gray-500">Provedores, bancos homologados, adapters, webhooks e saúde das integrações. As credenciais são da loja, nunca cadastradas/visíveis aqui.</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Estrutura criada (Fase 3). A persistência (provedores, adapters, webhooks, logs) será ativada após os models do F&amp;I e a aplicação da migration.
      </div>
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
