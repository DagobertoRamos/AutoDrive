'use client'

// =============================================================================
// Regras de Comissão — AutoDrive
// Configuração das regras base de comissionamento por unidade/vendedor
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Settings, RefreshCw, Plus, Edit2, Trash2, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommissionRule {
  id:             string
  name:           string
  description:    string | null
  percentBase:    number
  minSales:       number
  maxSales:       number | null
  active:         boolean
  unitId:         string | null
  unit?:          { name: string }
}

export default function RegrasComissoesPage() {
  const [rules, setRules]     = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/commissions/rules', { credentials: 'include' })
      const data = await res.json()
      if (data.success) setRules(data.data ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Regras de Comissão</h1>
          <p className="mt-0.5 text-sm text-gray-500">Gerencie as faixas e percentuais de comissionamento.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchRules} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </button>
          <button className="btn-primary text-xs">
            <Plus size={13} />
            Nova regra
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16">
          <Percent size={36} strokeWidth={1} className="text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-500">Nenhuma regra configurada</p>
          <p className="text-xs text-gray-400">Crie regras de comissão para que o cálculo automático funcione.</p>
          <button className="btn-primary mt-4 text-xs">
            <Plus size={13} />
            Criar primeira regra
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Nome','% Base','Faixa de Vendas','Unidade','Status','Ações'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-3 font-semibold text-brand-700 tabular-nums">{r.percentBase}%</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {r.minSales} – {r.maxSales ?? '∞'} vendas
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.unit?.name ?? 'Todas'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {r.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Edit2 size={13} /></button>
                        <button className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
