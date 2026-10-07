// =============================================================================
// Dinheiro em centavos inteiros (exato). O banco guarda Decimal(14,2); as somas
// em JavaScript passam por aqui para não acumular erro de ponto flutuante
// (ex.: 0,1 + 0,2) nem arredondar 1,005 para baixo.
// =============================================================================

/** Valor em reais → centavos inteiros (arredondamento "meio para cima"). */
export function toCents(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  if (!Number.isFinite(n)) return 0
  // toFixed(6) tira o ruído binário (1.005 * 100 = 100.49999…) antes de arredondar.
  return Math.round(Number((n * 100).toFixed(6)))
}

export const fromCents = (c: number): number => c / 100

/** Arredonda para centavos de forma exata. */
export const round2 = (v: unknown): number => fromCents(toCents(v))

/** Soma valores em reais sem erro acumulado. */
export function sumMoney(values: Iterable<unknown>): number {
  let c = 0
  for (const v of values) c += toCents(v)
  return fromCents(c)
}

/** Acumulador em centavos (para laços). */
export class MoneySum {
  private c = 0
  add(v: unknown) { this.c += toCents(v); return this }
  sub(v: unknown) { this.c -= toCents(v); return this }
  get value() { return fromCents(this.c) }
}
