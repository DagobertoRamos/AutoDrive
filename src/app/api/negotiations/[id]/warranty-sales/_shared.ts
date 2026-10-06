// Custo da garantia (o que a seguradora/gestora cobra da loja).
export function parseWarrantyCost(v: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v === undefined || v === null || v === '') return { ok: true, value: null }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Custo da garantia inválido.' }
  if (n > 99_999_999) return { ok: false, error: 'Custo da garantia muito alto.' }
  return { ok: true, value: Math.round(n * 100) / 100 }
}
