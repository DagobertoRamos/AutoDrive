'use client'

// =============================================================================
// Relatório — Visão Geral Financeira (AutoDrive)
// KPIs consolidados. Consome /api/reports/finance?view=visao-geral.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Summary { receitas: number; despesas: number; saldo: number; aReceber: number; aPagar: number }
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function VisaoGeralFinanceiraPage() {
  const [s, setS] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/finance?view=visao-geral', { credentials: 'include' })
      const json = await res.json(); setS(json?.summary ?? null)
    } catch { setS(null) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Receitas (realizadas)', value: s?.receitas ?? 0, cls: 'border-green-200 bg-green-50 text-green-700' },
    { label: 'Despesas (realizadas)', value: s?.despesas ?? 0, cls: 'border-red-200 bg-red-50 text-red-700' },
    { label: 'Saldo', value: s?.saldo ?? 0, cls: (s?.saldo ?? 0) >= 0 ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-orange-200 bg-orange-50 text-orange-700' },
    { label: 'A receber', value: s?.aReceber ?? 0, cls: 'border-gray-200 bg-white text-gray-900' },
    { label: 'A pagar', value: s?.aPagar ?? 0, cls: 'border-gray-200 bg-white text-gray-900' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Visão Geral Financeira</h1>
          <p className="mt-0.5 text-sm text-gray-500">Indicadores consolidados</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.cls)}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '—' : fmt(c.value)}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">Receitas/despesas consideram lançamentos liquidados (recebido/pago). “A receber/A pagar” são lançamentos previstos. Use a sincronização (vendas/comissões) ou lançamentos manuais para popular.</p>
    </div>
  )
}
