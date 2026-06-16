'use client'

// =============================================================================
// Configurações da Loja > F&I > Bancos da Loja (Fase 2b.2).
// O cadastro de bancos já existe em /financiamento/bancos (CRUD completo).
// Para evitar duplicação, esta página direciona para lá e contextualiza as
// configurações relacionadas (prioridades, retornos, credenciais).
// =============================================================================

import Link from 'next/link'
import { Landmark, ArrowRight, ListOrdered, Percent, KeyRound } from 'lucide-react'

const RELATED = [
  { href: '/configuracoes/fi/prioridades', title: 'Prioridades de Envio', desc: 'Ordem em que as fichas seguem aos bancos.', icon: ListOrdered },
  { href: '/configuracoes/fi/retornos', title: 'Retornos por Banco', desc: '% / valor fixo por faixa de parcelas.', icon: Percent },
  { href: '/configuracoes/fi/integracoes', title: 'Credenciais e Integrações', desc: 'Login/token por banco (criptografados).', icon: KeyRound },
]

export default function FiBanksConfigPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Bancos da Loja</h1>
        <p className="mt-0.5 text-sm text-gray-500">Cadastro de bancos e as configurações de F&amp;I que dependem deles.</p>
      </div>

      <Link href="/financiamento/bancos" className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/30">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Landmark size={20} /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 group-hover:text-brand-800">Gerenciar bancos</p>
          <p className="mt-0.5 text-sm text-gray-500">Cadastrar, editar, ativar/inativar os bancos com que a loja trabalha.</p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-gray-300 group-hover:text-brand-600" />
      </Link>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Configurações relacionadas</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {RELATED.map((a) => (
            <Link key={a.href} href={a.href} className="group rounded-xl border border-gray-200 bg-white p-4 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/30">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><a.icon size={18} /></div>
              <p className="font-semibold text-gray-900 group-hover:text-brand-800">{a.title}</p>
              <p className="mt-0.5 text-xs text-gray-500">{a.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
