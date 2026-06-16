// =============================================================================
// negotiation-rbac.ts — Helpers consistentes UI + backend para ações em deals
// =============================================================================

import { rank, canActOn } from '@/lib/role-hierarchy'

export const FINALIZED_STATUSES = new Set<string>(['FINALIZADA', 'CANCELADA'])
export const HARD_FINALIZED_STATUSES = new Set<string>(['FINALIZADA'])

// Status nos quais o VENDEDOR ainda pode editar a própria negociação.
// Cargos GERENTE+ e VENDEDOR_LIDER editam em qualquer status não-bloqueado.
const VENDEDOR_EDITABLE_STATUSES = new Set<string>([
  'RASCUNHO',
  'EM_PREENCHIMENTO',
  'DEVOLVIDA_PARA_CORRECAO',
  'REABERTA',
])

export function isDealLocked(status: string | null | undefined): boolean {
  if (!status) return false
  // Apenas FINALIZADA é "trancada" — pode ser reaberta por GERENTE+
  return HARD_FINALIZED_STATUSES.has(status)
}

/**
 * Verifica se o status do deal por si só permite edição (independente do ator).
 * Útil para rotas legadas que ainda raciocinam apenas em cima de (role, status).
 */
export function isDealStatusEditable(status: string | null | undefined): boolean {
  if (!status) return false
  return !isDealLocked(status)
}

type Actor = {
  id?:       string | null
  role:      string
  tenantId?: string | null
  sellerId?: string | null  // se for vendedor, o Seller.id correspondente
} | null | undefined

type DealLike = {
  tenantId?: string | null
  sellerId?: string | null
  createdById?: string | null
  status: string
  seller?: { user?: { role?: string | null } | null } | null
} | null | undefined

const MANAGER_ROLES   = new Set(['GERENTE', 'GERENTE_GERAL', 'ADM', 'MASTER'])

function isManagerPlus(role: string | undefined): boolean {
  return !!role && MANAGER_ROLES.has(role)
}

export function canEditDeal(actor: Actor, deal: DealLike): boolean {
  if (!actor || !deal) return false
  if (!isDealStatusEditable(deal.status)) return false
  if (isManagerPlus(actor.role)) return true
  if (actor.role === 'VENDEDOR_LIDER') return true
  if (actor.role === 'VENDEDOR') {
    // VENDEDOR só edita em status iniciais
    if (!VENDEDOR_EDITABLE_STATUSES.has(deal.status)) return false
    // Quando o ator tem sellerId, restringe à própria negociação;
    // sem sellerId no contexto (chamadas legadas), aplica apenas a checagem de status.
    if (actor.sellerId) return deal.sellerId === actor.sellerId
    return true
  }
  return false
}

export function canFinalize(actor: Actor, deal: DealLike): boolean {
  if (!actor || !deal) return false
  if (isDealLocked(deal.status)) return false
  return isManagerPlus(actor.role)
}

export function canApproveDiscount(actor: Actor, _deal: DealLike): boolean {
  if (!actor) return false
  return rank(actor.role) >= rank('GERENTE')
}

export function canReopen(actor: Actor, deal: DealLike): boolean {
  if (!actor || !deal) return false
  if (!isDealLocked(deal.status)) return false
  if (rank(actor.role) < rank('GERENTE')) return false
  // Gerente não pode reabrir negociação de ADM/MASTER
  const ownerRole = deal.seller?.user?.role ?? null
  return canActOn(actor.role as any, ownerRole as any)
}

export function canAddPayment(actor: Actor, deal: DealLike): boolean {
  if (!actor || !deal) return false
  if (isDealLocked(deal.status)) return false
  if (isManagerPlus(actor.role) || actor.role === 'VENDEDOR_LIDER') return true
  if (actor.role === 'VENDEDOR') {
    if (deal.sellerId && actor.sellerId && deal.sellerId === actor.sellerId) return true
    return false
  }
  return false
}

export function canRequestDiscount(actor: Actor, deal: DealLike): boolean {
  return canAddPayment(actor, deal)
}

export function canForceFinalize(actor: Actor): boolean {
  return actor?.role === 'MASTER'
}
