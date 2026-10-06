// Plano de contas em árvore — montagem pura (ordem por código/ordem/nome, linha
// da DRE herdada do ancestral, contagem de lançamentos própria e acumulada).
import { DRE_GROUP_BY_KEY } from '@/lib/finance/dre-core'

export interface CategoryRow {
  id: string; name: string; kind: string; code: string | null; color: string | null
  parentId: string | null; dreGroup: string | null; sortOrder: number; active: boolean
}

export interface CategoryNode extends CategoryRow {
  depth: number
  effectiveDreGroup: string | null
  dreLabel: string | null
  dreInherited: boolean
  entryCount: number
  totalEntryCount: number
  children: CategoryNode[]
}

/** Compara códigos "1.10" > "1.2" numericamente; sem código vai para o fim. */
export function compareCode(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  const pa = a.split('.').map((x) => Number(x))
  const pb = b.split('.').map((x) => Number(x))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1
    const y = pb[i] ?? -1
    if (Number.isNaN(x) || Number.isNaN(y)) return a.localeCompare(b)
    if (x !== y) return x - y
  }
  return 0
}

const sortRows = (a: CategoryRow, b: CategoryRow) =>
  compareCode(a.code, b.code) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR')

export function buildCategoryTree(rows: CategoryRow[], counts: Map<string, number>): CategoryNode[] {
  const byParent = new Map<string | null, CategoryRow[]>()
  const ids = new Set(rows.map((r) => r.id))
  for (const r of rows) {
    const p = r.parentId && ids.has(r.parentId) ? r.parentId : null
    byParent.set(p, [...(byParent.get(p) ?? []), r])
  }
  const build = (parentId: string | null, depth: number, inherited: string | null, seen: Set<string>): CategoryNode[] =>
    (byParent.get(parentId) ?? []).sort(sortRows).filter((r) => !seen.has(r.id)).map((r) => {
      const own = r.dreGroup && DRE_GROUP_BY_KEY[r.dreGroup] ? r.dreGroup : null
      const eff = own ?? inherited
      const children = depth > 6 ? [] : build(r.id, depth + 1, eff, new Set([...seen, r.id]))
      const entryCount = counts.get(r.id) ?? 0
      return {
        ...r, depth, effectiveDreGroup: eff, dreLabel: eff ? DRE_GROUP_BY_KEY[eff]?.label ?? null : null,
        dreInherited: !own && !!eff, entryCount,
        totalEntryCount: entryCount + children.reduce((s, c) => s + c.totalEntryCount, 0), children,
      }
    })
  return build(null, 0, null, new Set())
}

/** Próximo código livre: filhos de "12" → "12.6"; raiz → maior inteiro + 1. */
export function nextCode(parentCode: string | null, siblingCodes: (string | null)[]): string {
  const prefix = parentCode ? `${parentCode}.` : ''
  let max = 0
  for (const c of siblingCodes) {
    if (!c || !c.startsWith(prefix)) continue
    const rest = c.slice(prefix.length)
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest))
  }
  return `${prefix}${max + 1}`
}

/** `candidateParentId` está dentro da subárvore de `id`? (impede ciclo ao mover) */
export function isDescendant(rows: Pick<CategoryRow, 'id' | 'parentId'>[], id: string, candidateParentId: string): boolean {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]))
  let cur: string | null | undefined = candidateParentId
  for (let guard = 0; cur && guard < 50; guard++) {
    if (cur === id) return true
    cur = parentOf.get(cur)
  }
  return false
}
