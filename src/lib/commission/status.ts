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
  return {
    status: { in: COMMISSION_ELIGIBLE_DEAL_STATUSES },
    OR: [
      { approvedAt:  { gte: window.start, lte: window.end } },
      { releasedAt:  { gte: window.start, lte: window.end } },
      { finalizedAt: { gte: window.start, lte: window.end } },
      { saleDate:    { gte: window.start, lte: window.end } },
      {
        AND: [
          { approvedAt: null },
          { releasedAt: null },
          { finalizedAt: null },
          { saleDate: null },
          { createdAt: { gte: window.start, lte: window.end } },
        ],
      },
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
