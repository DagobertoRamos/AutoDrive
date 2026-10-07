// =============================================================================
// Regras puras do orquestrador: como o status da negociação, os pagamentos e o
// F&I viram dimensões da operação, e como o histórico de operações diz se o
// carro está no estoque do RENAVE.
// =============================================================================

import type { CommercialStatus, FinancingStatus } from './status-core'

const RESERVED_DEAL = new Set([
  'APROVADA', 'LIBERADA', 'SINAL_RECEBIDO', 'RESERVADA', 'AGUARDANDO_FINANCEIRO', 'FINANCEIRO_APROVADO',
  'AGUARDANDO_DOCUMENTACAO', 'DOCUMENTACAO_CONCLUIDA', 'AGUARDANDO_CONTRATO', 'CONTRATO_GERADO',
  'AGUARDANDO_ASSINATURA', 'ASSINADA', 'AGUARDANDO_ENTREGA', 'ENTREGUE', 'EM_ANDAMENTO',
])
const DEAD_DEAL = new Set(['CANCELADA', 'RECUSADA', 'DESAPROVADA'])

/** Status comercial da operação a partir do status da negociação. */
export function commercialFromDeal(dealStatus: string, kind: string): CommercialStatus {
  const s = String(dealStatus).toUpperCase()
  if (DEAD_DEAL.has(s)) return 'CANCELLED'
  if (s === 'FINALIZADA') return kind === 'SALE' ? 'SOLD' : 'ACQUIRED'
  if (RESERVED_DEAL.has(s)) return 'RESERVED'
  return 'OPEN'
}

/** A negociação gera operação acompanhada? (rascunho não; aprovada em diante sim). */
export function dealNeedsOperations(dealStatus: string): boolean {
  const s = String(dealStatus).toUpperCase()
  return s === 'FINALIZADA' || RESERVED_DEAL.has(s) || DEAD_DEAL.has(s) || s === 'REABERTA'
}

export function kindForRole(role: string): 'SALE' | 'PURCHASE' | 'CONSIGNMENT' | null {
  switch (String(role).toUpperCase()) {
    case 'VENDIDO': return 'SALE'
    case 'TROCA':
    case 'COMPRADO': return 'PURCHASE'
    case 'CONSIGNADO': return 'CONSIGNMENT'
    default: return null
  }
}

const FI_STAGE_TO_STATUS: Record<string, FinancingStatus> = {
  SIMULACAO: 'PROPOSAL', ENVIADO: 'PROPOSAL', EM_ANALISE: 'PROPOSAL',
  APROVADO: 'APPROVED', FORMALIZACAO: 'APPROVED',
  ASSINADO: 'CONTRACT_SIGNED', ENVIADO_BANCO: 'CONTRACT_SIGNED', AGUARDANDO_PAGAMENTO: 'CONTRACT_SIGNED',
  PAGO: 'BANK_PAID',
}
const FIN_RANK: Record<string, number> = { NOT_APPLICABLE: 0, PROPOSAL: 1, APPROVED: 2, CONTRACT_SIGNED: 3, LIEN_REGISTERED: 4, BANK_PAID: 5, CHARGEBACK: 6 }

/** Financiamento derivado dos pagamentos da venda + acompanhamento do contrato. */
export function deriveFinancing(payments: { type: string; status: string | null; stage?: string | null; chargeback?: boolean }[]): FinancingStatus {
  const fin = payments.filter((p) => String(p.type).toUpperCase() === 'FINANCIAMENTO' && String(p.status ?? '').toUpperCase() !== 'CANCELADO' && p.stage !== 'CANCELADO')
  if (!fin.length) return 'NOT_APPLICABLE'
  if (fin.some((p) => p.chargeback)) return 'CHARGEBACK'
  let best: FinancingStatus = 'PROPOSAL'
  for (const p of fin) {
    const s: FinancingStatus = p.stage ? (FI_STAGE_TO_STATUS[p.stage] ?? 'PROPOSAL') : String(p.status ?? '').toUpperCase() === 'CONFIRMADO' ? 'BANK_PAID' : 'PROPOSAL'
    if (FIN_RANK[s] > FIN_RANK[best]) best = s
  }
  return best
}

/** Gravame informado à mão não é rebaixado pela derivação (só avança). */
export function mergeFinancing(current: string, derived: FinancingStatus): string {
  if (derived === 'NOT_APPLICABLE' || derived === 'CHARGEBACK') return derived
  if (current === 'LIEN_REGISTERED' && FIN_RANK[derived] < FIN_RANK.LIEN_REGISTERED) return current
  return derived
}

export interface OpRenaveRow { kind: string; renaveStatus: string; fiscalStatus: string; createdAt: Date | string; cancelledAt?: Date | string | null }

/**
 * Situação do carro no estoque do RENAVE pelas operações:
 * IN = última entrada confirmada depois da última saída; OUT = saída confirmada;
 * PENDING = entrada enviada sem confirmação; NONE = nada registrado.
 */
export function renaveStockState(ops: OpRenaveRow[]): 'IN' | 'OUT' | 'PENDING' | 'NONE' {
  const t = (d: Date | string) => new Date(d).getTime()
  let lastEntry = -1, lastExit = -1, pending = false
  for (const o of ops) {
    if (o.kind !== 'SALE' && o.renaveStatus === 'ENTRY_CONFIRMED') lastEntry = Math.max(lastEntry, t(o.createdAt))
    if (o.kind === 'SALE' && o.renaveStatus === 'EXIT_CONFIRMED') lastExit = Math.max(lastExit, t(o.createdAt))
    if (o.kind !== 'SALE' && !o.cancelledAt && (o.renaveStatus === 'ENTRY_SUBMITTED' || o.renaveStatus === 'UNKNOWN')) pending = true
  }
  if (lastEntry >= 0 && lastEntry > lastExit) return 'IN'
  if (lastExit >= 0) return 'OUT'
  return pending ? 'PENDING' : 'NONE'
}

/** Nota de entrada do carro: a da operação de entrada mais recente. */
export function fiscalEntryState(ops: OpRenaveRow[]): 'AUTHORIZED' | 'PENDING' | 'NONE' | 'REJECTED' {
  const entries = ops.filter((o) => o.kind !== 'SALE' && !o.cancelledAt).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const s = entries[0]?.fiscalStatus
  if (!s) return 'NONE'
  if (s === 'AUTHORIZED' || s === 'NOT_REQUIRED') return 'AUTHORIZED'
  if (s === 'REJECTED') return 'REJECTED'
  return 'PENDING'
}
