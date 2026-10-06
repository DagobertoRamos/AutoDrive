'use client'

import { useMemo } from 'react'
import { categoryTree, type RefCategory } from './useFinanceRefs'

/** Seleção do plano de contas em árvore: "código  nome", recuado pelo nível. */
export function CategorySelect({ categories, kind, value, onChange, className, emptyLabel = '—', disabled }: {
  categories: RefCategory[]; kind?: 'RECEITA' | 'DESPESA'; value: string; onChange: (id: string) => void
  className?: string; emptyLabel?: string; disabled?: boolean
}) {
  const tree = useMemo(() => categoryTree(categories, kind), [categories, kind])
  return (
    <select className={className} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {tree.map((c) => (
        <option key={c.id} value={c.id} className={c.hasChildren ? 'font-semibold' : undefined}>
          {'   '.repeat(c.depth)}{c.code ? `${c.code} ` : ''}{c.name}
        </option>
      ))}
    </select>
  )
}
