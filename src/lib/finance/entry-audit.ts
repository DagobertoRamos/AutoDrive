// Auditoria de lançamentos: só os campos que mudaram, com valor antigo e novo.

const IGNORE = new Set(['updatedAt', 'createdAt'])

const norm = (v: unknown): unknown => {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object' && 'toNumber' in (v as object)) return Number(v as never)
  return v
}

/** { before, after } com apenas os campos alterados; null se nada mudou. */
export function entryDiff(before: Record<string, unknown>, after: Record<string, unknown>): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {}
  const a: Record<string, unknown> = {}
  for (const k of Object.keys(after)) {
    if (IGNORE.has(k)) continue
    const x = norm(before[k]); const y = norm(after[k])
    if (JSON.stringify(x) !== JSON.stringify(y)) { b[k] = x; a[k] = y }
  }
  return Object.keys(a).length ? { before: b, after: a } : null
}
