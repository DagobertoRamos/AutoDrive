'use client'

// Resultado da negociação: receitas − custos (veículo, serviços, F&I, comissões).
// Só aparece para quem pode ver lucro (a API responde 403 aos demais).

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { HelpHint } from '@/components/ui/help-hint'

interface Line { key: string; label: string; value: number; sign: 1 | -1 }
interface Result { profit: number; margin: number | null; lines: Line[]; revenue: { total: number }; cost: { total: number } }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function DealResultCard({ dealId, version }: { dealId: string; version?: string | null }) {
  const [r, setR] = useState<Result | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/negotiations/${dealId}/result`, { cache: 'no-store' })
      .then((x) => (x.ok ? x.json() : null))
      .then((j) => { if (alive) setR(j?.success ? j.data : null) })
      .catch(() => {})
    return () => { alive = false }
  }, [dealId, version])
  if (!r) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
        <h3 className="flex items-center gap-2 font-semibold text-gray-800">
          <TrendingUp size={15} className="text-brand-600" />Resultado
          <HelpHint size={13} text="Receitas da venda (veículo, serviços, documentação, garantia e F&I) menos custo real do carro, custos dos serviços, débitos assumidos pela loja e comissões." />
        </h3>
        <span className={`text-sm font-bold tabular-nums ${r.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {brl(r.profit)}{r.margin != null && <span className="ml-1.5 text-xs font-semibold text-gray-500">{r.margin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-50">
          {r.lines.map((l) => (
            <tr key={l.key}>
              <td className="px-4 py-1.5 text-gray-600">{l.label}</td>
              <td className={`px-4 py-1.5 text-right tabular-nums ${l.sign < 0 ? 'text-red-600' : 'text-gray-900'}`}>{l.sign < 0 ? '− ' : ''}{brl(l.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
