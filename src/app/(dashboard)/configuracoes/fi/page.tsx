'use client'

// =============================================================================
// Configurações da Loja > F&I — hub (estrutura Fase 2).
// Reúne as áreas de configuração do F&I da loja. RBAC: financing.config
// (ADM/gestão/financeiro). A persistência real (credenciais criptografadas,
// prioridades, retornos) é a Fase 2b — depende dos models da Fase 4 + migration.
// =============================================================================

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Landmark, KeyRound, ListOrdered, Percent, Package, FileCheck2, ShieldCheck, Lock } from 'lucide-react'

const CONFIG_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO']

const AREAS = [
  { href: '/configuracoes/fi/bancos', title: 'Bancos da Loja', desc: 'Bancos ativos, prazo, idade do veículo e regras por banco.', icon: Landmark },
  { href: '/configuracoes/fi/integracoes', title: 'Credenciais e Integrações', desc: 'Login, token e chaves por banco (criptografados e mascarados).', icon: KeyRound },
  { href: '/configuracoes/fi/prioridades', title: 'Prioridades de Envio', desc: 'Ordem de envio das fichas aos bancos.', icon: ListOrdered },
  { href: '/configuracoes/fi/retornos', title: 'Retornos por Banco', desc: '% de retorno, valor fixo e regras por prazo.', icon: Percent },
  { href: '/configuracoes/fi/produtos', title: 'Produtos Agregados', desc: 'Garantia, seguro, proteção, rastreador.', icon: Package },
  { href: '/configuracoes/fi/documentos', title: 'Documentos Obrigatórios', desc: 'Documentos exigidos por perfil de proponente.', icon: FileCheck2 },
  { href: '/configuracoes/fi/permissoes', title: 'Permissões F&I', desc: 'Quem envia ficha, aprova e altera retorno.', icon: ShieldCheck },
]

export default function FiConfigHub() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)

  if (session && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Configuração restrita</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">As configurações de F&amp;I da loja são gerenciadas por administração/gerência/financeiro.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configurações de F&amp;I da Loja</h1>
        <p className="mt-0.5 text-sm text-gray-500">Bancos, credenciais, prioridades, retornos e regras operacionais da sua loja.</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Estrutura criada (Fase 2). A persistência (credenciais criptografadas, prioridades, retornos) será ativada após os models do F&amp;I e a aplicação da migration.
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
