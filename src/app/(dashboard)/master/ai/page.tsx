'use client'

// =============================================================================
// Master > Inteligência Artificial — hub. MASTER-only.
// Arquitetura de IA controlada: provedores/conectores, instruções (ensinar a
// IA), base de conhecimento, logs, segurança/limites e testes. Sem chamada real
// sem credencial/doc oficial — MockAI cobre testes.
// =============================================================================

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Bot, Plug, BookOpen, ScrollText, ShieldCheck, FlaskConical, GraduationCap, Lock } from 'lucide-react'

const AREAS = [
  { href: '/master/ai/providers', title: 'Provedores / Conectores', desc: 'Gemini, OpenAI, Anthropic ou customizado — chaves cifradas, limites e capacidades.', icon: Plug },
  { href: '/master/ai/instructions', title: 'Instruções da IA', desc: 'Ensine a IA: regras globais de comportamento por escopo, com histórico.', icon: GraduationCap },
  { href: '/master/ai/knowledge', title: 'Base de Conhecimento', desc: 'Manuais, políticas, fluxos e FAQs que a IA pode usar (com origem rastreável).', icon: BookOpen },
  { href: '/master/ai/logs', title: 'Logs de Uso', desc: 'Uso da IA por recurso, sem dados sensíveis.', icon: ScrollText },
  { href: '/master/ai/testes', title: 'Testes de IA', desc: 'Testar conexão e respostas (MockAI sem custo).', icon: FlaskConical },
]

export default function MasterAiHub() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  if (session && role && role !== 'MASTER') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p><p className="mt-1 max-w-md text-sm text-gray-500">A configuração da IA da plataforma é do MASTER. As lojas usam a IA conforme permissões e escopos.</p></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Bot size={20} className="text-brand-600" />Inteligência Artificial</h1>
        <p className="mt-0.5 text-sm text-gray-500">Módulo de IA controlada do AutoDrive — segura, configurável e com escopos.</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
        <span><strong>IA controlada:</strong> por padrão apenas lê, explica, resume e sugere — nunca altera dados, aprova ou executa ação sensível sem confirmação. Chaves dos provedores são cifradas e nunca expostas. Sem credencial/documentação oficial, o sistema usa o <strong>MockAI</strong> (testes). Respeita tenant, permissões e LGPD.</span>
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
