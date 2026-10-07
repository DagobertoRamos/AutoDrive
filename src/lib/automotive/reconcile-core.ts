// =============================================================================
// Reconciliação estoque interno × RENAVE × fiscal (puro).
// O estoque do sistema continua sendo o operacional; o RENAVE é um espelho que
// precisa bater. Divergência = os dois dizem coisas diferentes do mesmo carro.
// =============================================================================

/** Status de estoque que significam "o carro ainda é da loja". */
const OUT_OF_STOCK = new Set(['VENDIDO', 'CANCELADO', 'DEVOLVIDO'])
export function isInInternalStock(stockStatus: string | null | undefined): boolean {
  return !OUT_OF_STOCK.has(String(stockStatus ?? 'DISPONIVEL').toUpperCase())
}

export interface ReconcileRow {
  vehicleId: string
  stockStatus: string | null
  /** Situação no RENAVE vista pelas operações: IN / OUT / NONE / PENDING. */
  renave: 'IN' | 'OUT' | 'NONE' | 'PENDING'
  /** Nota de entrada: AUTHORIZED / PENDING / NONE / REJECTED. */
  fiscalEntry: string
  /** Vendido recentemente: a saída ainda está no prazo (não é divergência). */
  soldWithinGrace?: boolean
}

export type ReconcileIssue = 'RENAVE_MISSING_ENTRY' | 'RENAVE_EXIT_WITHOUT_SALE' | 'RENAVE_STILL_IN_STOCK' | 'NFE_PENDING'

export function classify(row: ReconcileRow, opts: { renaveTracked: boolean; fiscalTracked: boolean }): ReconcileIssue[] {
  const inStock = isInInternalStock(row.stockStatus)
  const out: ReconcileIssue[] = []
  if (opts.renaveTracked) {
    if (inStock && row.renave === 'OUT') out.push('RENAVE_EXIT_WITHOUT_SALE')
    else if (inStock && (row.renave === 'NONE' || row.renave === 'PENDING')) out.push('RENAVE_MISSING_ENTRY')
    else if (!inStock && row.renave === 'IN' && String(row.stockStatus).toUpperCase() === 'VENDIDO' && !row.soldWithinGrace) out.push('RENAVE_STILL_IN_STOCK')
  }
  if (opts.fiscalTracked && inStock && row.fiscalEntry !== 'AUTHORIZED') out.push('NFE_PENDING')
  return out
}

export interface StockIndicators {
  total: number
  renaveOk: number
  pending: number
  divergent: number
  nfePending: number
}

/**
 * Indicadores do topo do estoque. "Pendente" = falta registrar (normal no dia a
 * dia); "Divergência" = sistema e RENAVE discordam (precisa revisão).
 */
export function stockIndicators(rows: ReconcileRow[], opts: { renaveTracked: boolean; fiscalTracked: boolean }): StockIndicators {
  const inStock = rows.filter((r) => isInInternalStock(r.stockStatus))
  let renaveOk = 0, pending = 0, divergent = 0, nfePending = 0
  for (const r of rows) {
    const issues = classify(r, opts)
    if (issues.includes('RENAVE_EXIT_WITHOUT_SALE') || issues.includes('RENAVE_STILL_IN_STOCK')) divergent++
    if (issues.includes('RENAVE_MISSING_ENTRY')) pending++
    if (issues.includes('NFE_PENDING')) nfePending++
  }
  for (const r of inStock) if (r.renave === 'IN') renaveOk++
  return { total: inStock.length, renaveOk, pending, divergent, nfePending }
}

export const ISSUE_TEXT: Record<ReconcileIssue, string> = {
  RENAVE_MISSING_ENTRY: 'Entrada no RENAVE pendente',
  RENAVE_EXIT_WITHOUT_SALE: 'Saída no RENAVE sem venda no sistema',
  RENAVE_STILL_IN_STOCK: 'Vendido, mas ainda no estoque do RENAVE',
  NFE_PENDING: 'NF-e de entrada pendente',
}
