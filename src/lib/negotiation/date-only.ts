// Datas "só dia" (aaaa-mm-dd) vindas dos formulários: grava ao meio-dia para
// não virar o dia anterior no fuso do Brasil. Data com hora segue como veio.
// Vazio/inválido → null.
export function parseDateOnly(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s)
  return Number.isNaN(d.getTime()) ? null : d
}
