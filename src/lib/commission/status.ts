import type { DealStatus } from '@prisma/client'

export const COMMISSION_ELIGIBLE_DEAL_STATUSES: DealStatus[] = [
  'APROVADA',
  'LIBERADA',
  'AGUARDANDO_SINAL',
  'SINAL_RECEBIDO',
  'RESERVADA',
  'AGUARDANDO_FINANCEIRO',
  'FINANCEIRO_APROVADO',
  'AGUARDANDO_DOCUMENTACAO',
  'DOCUMENTACAO_CONCLUIDA',
  'AGUARDANDO_CONTRATO',
  'CONTRATO_GERADO',
  'AGUARDANDO_ASSINATURA',
  'ASSINADA',
  'AGUARDANDO_ENTREGA',
  'ENTREGUE',
  'FINALIZADA',
]

const ELIGIBLE_STATUS_SET = new Set<string>(COMMISSION_ELIGIBLE_DEAL_STATUSES)

export function isCommissionEligibleStatus(status: string | null | undefined): boolean {
  return !!status && ELIGIBLE_STATUS_SET.has(String(status).toUpperCase())
}

export interface CommissionWindow {
  start: Date
  end: Date
}

export function commissionEligibleDealWindowWhere(window: CommissionWindow): Record<string, unknown> {
  // Mesma precedência de commissionReferenceDate: vale a PRIMEIRA data preenchida
  // (aprovação → liberação → finalização → venda → criação). Assim a negociação
  // cai num único período, sem contar em dois meses.
  const inWindow = { gte: window.start, lte: window.end }
  return {
    status: { in: COMMISSION_ELIGIBLE_DEAL_STATUSES },
    OR: [
      { approvedAt: inWindow },
      { approvedAt: null, releasedAt: inWindow },
      { approvedAt: null, releasedAt: null, finalizedAt: inWindow },
      { approvedAt: null, releasedAt: null, finalizedAt: null, saleDate: inWindow },
      { approvedAt: null, releasedAt: null, finalizedAt: null, saleDate: null, createdAt: inWindow },
    ],
  }
}

export function commissionReferenceDate(
  deal: {
    approvedAt?: Date | null
    releasedAt?: Date | null
    finalizedAt?: Date | null
    saleDate?: Date | null
    createdAt?: Date | null
  },
  fallback = new Date(),
): Date {
  return deal.approvedAt ?? deal.releasedAt ?? deal.finalizedAt ?? deal.saleDate ?? deal.createdAt ?? fallback
}
