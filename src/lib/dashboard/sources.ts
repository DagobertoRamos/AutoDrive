// =============================================================================
// dashboard/sources.ts — critérios (WHERE) compartilhados entre os blocos do
// dashboard e a central "Precisa da sua atenção". Um número só tem UMA regra:
// os mesmos filtros das telas de origem (relatório de parados, Operações,
// preparação, F&I), para o card nunca divergir da lista do drill-down.
// =============================================================================

import type { Prisma } from '@prisma/client'
import type { DashboardContext } from '@/lib/dashboard/context'
import { NO_MATCH } from '@/lib/dashboard/context'

const DAY = 86_400_000

/** Fora do estoque — mesmo critério do relatório /relatorios/estoque/parados. */
export const OUT_OF_STOCK_STATUSES = ['VENDIDO', 'CANCELADO', 'DEVOLVIDO'] as const
export const PREP_STOCK_STATUSES = ['PENDENTE_PREPARACAO', 'EM_SERVICO'] as const
export const NEGOTIATION_STOCK_STATUSES = ['EM_NEGOCIACAO', 'RESERVADO'] as const
export const AVAILABLE_STOCK_STATUSES = ['DISPONIVEL', 'EM_PROMOCAO'] as const

/** Serviço de preparação em aberto (prep-core: CONCLUIDO/NEGADO/CANCELADO encerram). */
export const OPEN_SERVICE_STATUSES = ['AGUARDANDO', 'EM_SERVICO'] as const

/** Transferência parada há mais de N dias (mesmo corte do painel de Operações). */
export const STALLED_TRANSFER_DAYS = 5
/** Estoque parado: mais de N dias (faixa "90+ dias" do relatório). */
export const AGED_STOCK_DAYS = 90
/** Banco "demorando para pagar" (mesmo corte do F&I). */
export const SLOW_FUNDING_DAYS = 3

export const daysAgo = (n: number, now = Date.now()) => new Date(now - n * DAY)

const tenantPart = (ctx: DashboardContext) => (ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH })

/** Veículo no estoque, no escopo do colaborador. */
export function inStockVehicleWhere(ctx: DashboardContext, extra?: Prisma.VehicleWhereInput): Prisma.VehicleWhereInput {
  const base: Prisma.VehicleWhereInput = {
    ...tenantPart(ctx),
    ...(ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
    active: true,
    stockStatus: { notIn: [...OUT_OF_STOCK_STATUSES] },
  }
  return extra ? { AND: [base, extra] } : base
}

/** Serviço de preparação no escopo (unidade = unidade do veículo). */
export function serviceWhere(ctx: DashboardContext, extra?: Prisma.VehicleServiceWhereInput): Prisma.VehicleServiceWhereInput {
  const base: Prisma.VehicleServiceWhereInput = {
    ...tenantPart(ctx),
    ...(ctx.profile.scope === 'UNIT' ? { vehicle: { unitId: ctx.unitId ?? NO_MATCH } } : {}),
  }
  return extra ? { AND: [base, extra] } : base
}

/** Em serviço com previsão vencida (= prep-core.isOverdue). */
export function overdueServiceWhere(ctx: DashboardContext, now = new Date()): Prisma.VehicleServiceWhereInput {
  return serviceWhere(ctx, { status: 'EM_SERVICO', dueAt: { lt: now } })
}

/** Operação veicular no escopo (unidade quando o colaborador é de unidade). */
export function operationWhere(ctx: DashboardContext, extra?: Prisma.VehicleOperationWhereInput): Prisma.VehicleOperationWhereInput {
  const base: Prisma.VehicleOperationWhereInput = {
    ...tenantPart(ctx),
    ...(ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
  }
  return extra ? { AND: [base, extra] } : base
}

/** Transferência de venda em aberto — mesmo filtro de /operacoes/transferencias?aba=open. */
export function openTransferWhere(ctx: DashboardContext): Prisma.VehicleOperationWhereInput {
  return operationWhere(ctx, {
    kind: 'SALE',
    cancelledAt: null,
    commercialStatus: 'SOLD',
    transferStatus: { notIn: ['NOT_APPLICABLE', 'CRLV_ISSUED'] },
  })
}

export function stalledTransferWhere(ctx: DashboardContext, now = Date.now()): Prisma.VehicleOperationWhereInput {
  return { AND: [openTransferWhere(ctx), { updatedAt: { lt: daysAgo(STALLED_TRANSFER_DAYS, now) } }] }
}
