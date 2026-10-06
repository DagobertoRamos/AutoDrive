// =============================================================================
// Parcelamento de lançamentos (regras puras, sem banco).
//   splitInstallments → N valores iguais em centavos, ajuste na última parcela.
//   addMonthsYmd      → mesma data N meses depois (dia limitado ao fim do mês).
//   installmentLabel  → "Descrição (k/N)".
// =============================================================================

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/** Divide `total` em `n` parcelas iguais (centavos); a diferença de arredondamento vai na última. */
export function splitInstallments(total: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n))
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / count)
  const out = Array.from({ length: count }, () => base)
  out[count - 1] = cents - base * (count - 1)
  return out.map((c) => c / 100)
}

/** Último dia do mês (month 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** `YYYY-MM-DD` + k meses, com o dia preso ao tamanho do mês (31/01 + 1 → 28/02 ou 29/02). */
export function addMonthsYmd(ymd: string, k: number, day?: number): string {
  const m = YMD.exec(ymd)
  if (!m) throw new Error(`Data inválida: ${ymd}`)
  const y0 = Number(m[1]); const mo0 = Number(m[2]) - 1; const d0 = day ?? Number(m[3])
  const idx = y0 * 12 + mo0 + k
  const y = Math.floor(idx / 12); const mo = idx - y * 12 + 1
  const d = Math.min(Math.max(1, d0), daysInMonth(y, mo))
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function installmentLabel(description: string, k: number, n: number): string {
  return n > 1 ? `${description.trim()} (${k}/${n})` : description.trim()
}

export interface InstallmentPlanItem { number: number; total: number; amount: number; dueDate: string; description: string }

/** Plano completo: parcela k vence `k-1` meses após o primeiro vencimento (mesmo dia do mês). */
export function buildInstallmentPlan(input: { description: string; total: number; count: number; firstDueDate: string }): InstallmentPlanItem[] {
  const n = Math.max(1, Math.floor(input.count))
  const day = Number(input.firstDueDate.slice(8, 10))
  return splitInstallments(input.total, n).map((amount, i) => ({
    number: i + 1, total: n, amount,
    dueDate: addMonthsYmd(input.firstDueDate, i, day),
    description: installmentLabel(input.description, i + 1, n),
  }))
}
