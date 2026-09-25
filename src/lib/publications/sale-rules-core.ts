// =============================================================================
// Venda × anúncios. PURO (testado).
//
// Regra da loja (padrão):
//   1. Venda registrada no sistema (negociação aberta) → PAUSA os anúncios
//      (onde o canal permite pausar; onde não permite, gera pendência manual).
//   2. Negociação FINALIZADA (veículo VENDIDO) → cancela agendamentos,
//      RETIRA os anúncios e arquiva como "Vendido".
//   3. Negociação cancelada e carro de volta ao estoque → reativa o que foi
//      pausado pela venda (configurável).
//   4. Retirado do estoque (bloqueado, devolvido, cancelado, inativo) →
//      retira e arquiva como "Retirado".
// A venda sempre tem prioridade na fila e bloqueia tarefas antigas.
// =============================================================================

/** Estoque que pode ir para os canais (mesma regra da vitrine do site). */
export const PUBLISHABLE_STOCK = ['DISPONIVEL', 'EM_PROMOCAO'] as const
/** Venda em andamento (negociação aberta ou aprovada). */
export const SALE_IN_PROGRESS = ['EM_NEGOCIACAO', 'RESERVADO'] as const
export const SOLD = ['VENDIDO'] as const
export const WITHDRAWN = ['BLOQUEADO', 'CANCELADO', 'DEVOLVIDO', 'EM_ATACADO'] as const

export type PauseOn = 'NEGOCIACAO' | 'APROVACAO'
/**
 * Canal que não tem "pausar" (Webmotors, OLX, posts): RETIRAR durante a venda
 * e republicar se ela cair (padrão dos integradores — evita vender o mesmo
 * carro duas vezes) ou só AVISAR (anúncio continua no ar, pendência manual).
 */
export type NoPauseAction = 'RETIRAR' | 'AVISAR'
export interface SaleRules { pauseOn: PauseOn; resumeOnCancel: boolean; whenNoPause: NoPauseAction }
export const DEFAULT_SALE_RULES: SaleRules = { pauseOn: 'NEGOCIACAO', resumeOnCancel: true, whenNoPause: 'RETIRAR' }

export type SaleActionKind = 'NONE' | 'PAUSE' | 'REMOVE' | 'RESUME'
export type SaleReason = 'VENDA_EM_ANDAMENTO' | 'VENDIDO' | 'RETIRADO' | 'VENDA_CANCELADA'
export interface SaleAction { kind: SaleActionKind; reason?: SaleReason; archive?: 'VENDIDO' | 'RETIRADO' }

export function isPublishableStock(stockStatus: string | null | undefined, active = true): boolean {
  return active && !!stockStatus && (PUBLISHABLE_STOCK as readonly string[]).includes(stockStatus)
}

/**
 * O que fazer com os anúncios do veículo diante da situação do estoque.
 * `pausedBySale` = há publicação pausada pela venda (para reativar no cancelamento).
 */
export function saleAction(stockStatus: string | null | undefined, active: boolean, rules: SaleRules = DEFAULT_SALE_RULES, pausedBySale = false): SaleAction {
  const s = (stockStatus ?? '').toUpperCase()
  if (!active) return { kind: 'REMOVE', reason: 'RETIRADO', archive: 'RETIRADO' }
  if ((SOLD as readonly string[]).includes(s)) return { kind: 'REMOVE', reason: 'VENDIDO', archive: 'VENDIDO' }
  if ((WITHDRAWN as readonly string[]).includes(s)) return { kind: 'REMOVE', reason: 'RETIRADO', archive: 'RETIRADO' }
  if (s === 'RESERVADO') return { kind: 'PAUSE', reason: 'VENDA_EM_ANDAMENTO' }
  if (s === 'EM_NEGOCIACAO') return rules.pauseOn === 'NEGOCIACAO' ? { kind: 'PAUSE', reason: 'VENDA_EM_ANDAMENTO' } : { kind: 'NONE' }
  if (isPublishableStock(s) && pausedBySale && rules.resumeOnCancel) return { kind: 'RESUME', reason: 'VENDA_CANCELADA' }
  return { kind: 'NONE' }
}

export const SALE_REASON_LABEL: Record<SaleReason, string> = {
  VENDA_EM_ANDAMENTO: 'Venda em andamento', VENDIDO: 'Vendido', RETIRADO: 'Retirado do estoque', VENDA_CANCELADA: 'Venda cancelada',
}
