'use client'

// =============================================================================
// F&I › Visão geral — o que está acontecendo, o que tem problema, o que fazer.
// Números principais + "Precisa da sua atenção". Gráficos ficam em Relatórios.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, Plus, RefreshCw } from 'lucide-react'
import { HelpHint } from '@/components/ui/help-hint'
import { api, brl, btnPrimary, btnSecondary, PageHeader } from '@/components/fi/ui'

interface Attention { key: string; count: number; label: string; href: string; tone: 'warning' | 'danger' | 'info' }
interface Overview {
  cards: { sentToday: number; approved: number; inAnalysis: number; pending: number; approvedCredit: number; awaitingPayment: { count: number; amount: number } }
  attention: Attention[]
}

const TONE: Record<Attention['tone'], string> = { danger: 'text-red-600', warning: 'text-amber-600', info: 'text-blue-600' }

export default function FiOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await api<Overview>('/api/financing/overview')
    if (r.ok) { setData(r.data); setError(null) } else setError(r.error)
    setLoading(false)
  }, [])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const c = data?.cards
  const cards: { label: string; value: string; href: string; hint?: 'PAGAMENTO_BANCO' }[] = c ? [
    { label: 'Propostas hoje', value: String(c.sentToday), href: '/financiamento/fichas?etapa=analise' },
    { label: 'Em análise', value: String(c.inAnalysis), href: '/financiamento/fichas?etapa=analise' },
    { label: 'Aprovadas', value: String(c.approved), href: '/financiamento/fichas?etapa=aprovadas' },
    { label: 'Pendências', value: String(c.pending), href: '/financiamento/fichas?etapa=pendencias' },
    { label: 'Crédito aprovado no mês', value: brl(c.approvedCredit), href: '/financiamento/fichas?etapa=aprovadas' },
    { label: 'Aguardando pagamento', value: c.awaitingPayment.count ? `${c.awaitingPayment.count} · ${brl(c.awaitingPayment.amount)}` : '0', href: '/financiamento/aguardando-pagamento', hint: 'PAGAMENTO_BANCO' },
  ] : []

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="F&I"
        helpTerm="FI"
        actions={<>
          <button onClick={load} className={btnSecondary} disabled={loading} aria-label="Atualizar"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <Link href="/financiamento/fichas?nova=1" className={btnPrimary}><Plus size={16} />Nova ficha</Link>
        </>}
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {!data && loading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[66px] animate-pulse rounded-xl bg-gray-100" />)}
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-brand-300">
            <p className="flex items-center gap-1 text-xs text-gray-500">{card.label}{card.hint && <HelpHint term={card.hint} size={11} />}</p>
            <p className="mt-1 truncate text-lg font-bold text-gray-900">{card.value}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Precisa da sua atenção</h2>
        {data && data.attention.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500"><CheckCircle2 size={16} className="text-green-600" />Nada pendente agora.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(data?.attention ?? []).map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-gray-50">
                  <span className="flex items-center gap-2 text-gray-800"><AlertTriangle size={15} className={TONE[a.tone]} aria-hidden />{a.label}</span>
                  <ArrowRight size={15} className="text-gray-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
