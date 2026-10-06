'use client'

import { useCallback, useEffect, useState } from 'react'

export interface RefAccount { id: string; name: string; type: string }
export interface RefCategory { id: string; name: string; code: string | null; kind: 'RECEITA' | 'DESPESA'; parentId: string | null }
export interface RefCostCenter { id: string; name: string; code: string | null }
export interface RefSupplier { id: string; name: string; kind: string | null }
export interface FinanceRefs {
  accounts: RefAccount[]; categories: RefCategory[]; costCenters: RefCostCenter[]; suppliers: RefSupplier[]
  canManage: boolean; canPayroll: boolean
}

const EMPTY: FinanceRefs = { accounts: [], categories: [], costCenters: [], suppliers: [], canManage: false, canPayroll: false }

/** Cadastros do financeiro (contas, plano de contas, centros de custo, fornecedores). */
export function useFinanceRefs() {
  const [refs, setRefs] = useState<FinanceRefs>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const load = useCallback(async () => {
    const j = await fetch('/api/finance/center/entries/refs', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) setRefs(j.data)
    setLoaded(true)
  }, [])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])
  return { refs, loaded, reload: load }
}

/** Plano de contas em ordem de árvore (pai, filhos…) com a profundidade. */
export function categoryTree(categories: RefCategory[], kind?: 'RECEITA' | 'DESPESA'): Array<RefCategory & { depth: number; hasChildren: boolean }> {
  const list = kind ? categories.filter((c) => c.kind === kind) : categories
  const ids = new Set(list.map((c) => c.id))
  const children = new Map<string | null, RefCategory[]>()
  for (const c of list) {
    const p = c.parentId && ids.has(c.parentId) ? c.parentId : null
    children.set(p, [...(children.get(p) ?? []), c])
  }
  const sortFn = (a: RefCategory, b: RefCategory) => (a.code ?? '').localeCompare(b.code ?? '', 'pt-BR', { numeric: true }) || a.name.localeCompare(b.name, 'pt-BR')
  const out: Array<RefCategory & { depth: number; hasChildren: boolean }> = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of [...(children.get(parent) ?? [])].sort(sortFn)) {
      out.push({ ...c, depth, hasChildren: (children.get(c.id) ?? []).length > 0 })
      if (depth < 6) walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
