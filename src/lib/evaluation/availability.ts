// =============================================================================
// availability.ts
//
// Regra centralizada de disponibilidade do veículo avaliado pra entrar em
// negociação (COMPRA / TROCA / CONSIGNACAO). É a fonte ÚNICA de verdade —
// usada pelo endpoint /api/negotiations/evaluations e por qualquer UI futura
// que precise da mesma checagem.
//
// Decide se uma avaliação pode aparecer no botão "Adicionar veículo avaliado".
// =============================================================================

export type Operation = 'COMPRA' | 'TROCA' | 'CONSIGNACAO'

export interface EvaluationAvailabilityInput {
  status?:               string | null   // workflow paralelo (LIBERADA etc.)
  result?:               string | null   // legado APROVADO etc.
  evaluatedValue?:       number | string | null
  customerDecision?:     string | null   // PENDENTE | ACEITA | RECUSADA | ANALISANDO | EXPIRADA | CANCELADA
  availableFor?:         string | null   // CSV "COMPRA,TROCA,CONSIGNACAO"
  proposalValidUntil?:   Date | string | null
  vehicleId?:            string | null   // se tem vehicle vinculado (já comprado)
  cancelledAt?:          Date | string | null
  /** Carregue os DealVehicle vinculados (com deal.status) pra detectar conflito. */
  dealVehicles?: Array<{
    deal?: { status?: string | null } | null
  }>
}

export interface EvaluationAvailabilityResult {
  canUse: boolean
  reason?: string
}

// Status do workflow paralelo que indicam liberação pelo gerente+
const RELEASED_STATUSES = new Set(['LIBERADA', 'APPROVED', 'FINALIZED', 'PENDING_REVIEW'])
const LEGACY_RELEASED   = new Set(['APROVADO'])

// Status de negociação que bloqueiam reuso do veículo (já vinculado em deal ativo)
const OPEN_DEAL_STATUSES = new Set([
  'AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO',
  'APROVADA', 'LIBERADA', 'SINAL_RECEBIDO', 'RESERVADA',
  'AGUARDANDO_FINANCEIRO', 'FINANCEIRO_APROVADO',
  'AGUARDANDO_DOCUMENTACAO', 'DOCUMENTACAO_CONCLUIDA',
  'AGUARDANDO_CONTRATO', 'CONTRATO_GERADO',
  'AGUARDANDO_ASSINATURA', 'ASSINADA',
  'AGUARDANDO_ENTREGA', 'ENTREGUE',
  'EM_ANDAMENTO', 'FINALIZADA',
])

export function canEvaluationVehicleBeUsed(
  evaluation: EvaluationAvailabilityInput,
  operation: Operation,
): EvaluationAvailabilityResult {
  if (!evaluation) return { canUse: false, reason: 'Avaliação não encontrada.' }

  if (evaluation.cancelledAt)
    return { canUse: false, reason: 'Avaliação cancelada.' }

  // 1) Liberada pelo gerente?
  const status  = (evaluation.status ?? '').toUpperCase()
  const result  = (evaluation.result ?? '').toUpperCase()
  const released = RELEASED_STATUSES.has(status) || LEGACY_RELEASED.has(result)
  if (!released)
    return { canUse: false, reason: 'Proposta ainda não liberada pelo gerente.' }

  // 2) Valor precificado?
  const value = Number(evaluation.evaluatedValue ?? 0)
  if (!Number.isFinite(value) || value <= 0)
    return { canUse: false, reason: 'Avaliação sem valor precificado.' }

  // 3) Cliente aceitou?
  const decision = (evaluation.customerDecision ?? 'PENDENTE').toUpperCase()
  if (decision === 'RECUSADA')
    return { canUse: false, reason: 'Cliente recusou a proposta.' }
  if (decision === 'EXPIRADA')
    return { canUse: false, reason: 'Proposta vencida.' }
  if (decision === 'CANCELADA')
    return { canUse: false, reason: 'Proposta cancelada.' }
  if (decision !== 'ACEITA')
    return { canUse: false, reason: 'Cliente ainda não aceitou a proposta.' }

  // 4) Validade da proposta vencida?
  if (evaluation.proposalValidUntil) {
    const valid = new Date(evaluation.proposalValidUntil)
    if (!Number.isNaN(valid.getTime()) && valid.getTime() < Date.now()) {
      return { canUse: false, reason: 'Validade da proposta expirada.' }
    }
  }

  // 5) Disponibilidade pra esta operação?
  // availableFor null = liberado pra TODAS (compat com avaliações antigas).
  const af = (evaluation.availableFor ?? '').toUpperCase()
  if (af && !af.split(',').map((s) => s.trim()).includes(operation)) {
    return { canUse: false, reason: `Proposta não liberada pra ${operation.toLowerCase()}.` }
  }

  // 6) Já vinculada a negociação ativa? (vehicleId setado OR dealVehicles abertos)
  if (evaluation.vehicleId) {
    // Tem Vehicle criado → já passou pela compra/troca finalizada
    // (mas se vendeu, stockStatus=VENDIDO; deixamos o caller filtrar isso).
  }
  if (evaluation.dealVehicles && evaluation.dealVehicles.length > 0) {
    const active = evaluation.dealVehicles.some(
      (dv) => OPEN_DEAL_STATUSES.has((dv.deal?.status ?? '').toUpperCase()),
    )
    if (active) return { canUse: false, reason: 'Veículo já vinculado a outra negociação ativa.' }
  }

  return { canUse: true }
}
