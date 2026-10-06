'use client'

// Maiores despesas do mês por grupo do plano de contas (barras horizontais).

import { CHART, brl } from './shared'

export interface TopExpense { categoryId: string | null; name: string; color: string | null; total: number }

/** `total` = despesa total do mês (base do %); sem ele, a soma das barras. */
export function TopExpensesBars({ data, total }: { data: TopExpense[]; total?: number }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-gray-400">Sem despesas no mês.</p>
  const max = Math.max(...data.map((d) => d.total))
  const sum = total && total > 0 ? total : data.reduce((s, d) => s + d.total, 0)
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.categoryId ?? 'none'} title={`${d.name}: ${brl(d.total)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-gray-700">{d.name}</span>
            <span className="shrink-0 tabular-nums font-medium text-gray-900">
              {brl(d.total)}
              <span className="ml-1.5 text-xs font-normal text-gray-400">{sum ? Math.round((d.total / sum) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (d.total / max) * 100)}%`, background: CHART.out }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
