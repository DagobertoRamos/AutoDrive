// =============================================================================
// goals/aggregators.ts — Cálculo de "realizado" por tipo de meta (AutoDrive)
//
// REGRA CENTRAL: toda agregação acontece aqui, no service layer — NUNCA no
// front-end. Cada GoalType tem um agregador dedicado que conta os eventos
// comercialmente elegíveis dentro da janela do período, respeitando o escopo
// (tenant/unidade/vendedor). Os filtros de escopo são aplicados de forma aditiva: quanto mais
// específico o escopo, mais restritiva a query.
// =============================================================================

import type { GoalType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { commissionEligibleDealWindowWhere } from '@/lib/commission/status'

/** Escopo de agregação já resolvido (sellerId derivado do userId no service). */
export interface AggregationScope {
  tenantId: string | null
  unitId?:  string | null
  sellerId?: string | null
  /** Unidades cujas negociações NÃO contam (ex.: unidade fora do ranking).
   *  Só se aplica quando unitId não está fixado — metas não usam. */
  excludeUnitIds?: string[]
}

/** Janela temporal fechada [start, end]. */
export interface AggregationWindow {
  start: Date
  end:   Date
}

export interface AggregatorResult {
  value: number
  /** Mensagem quando a regra do tipo ainda depende de definição de negócio. */
  note?: string
}

// ── Helpers de filtro ─────────────────────────────────────────────────────────

/** Filtro de escopo para o model Deal (e relações que apontam para Deal). */
function dealScopeWhere(scope: AggregationScope): Record<string, unknown> {
  return {
    ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
    ...(scope.unitId ? { unitId: scope.unitId } : {}),
    ...(!scope.unitId && scope.excludeUnitIds?.length ? { unitId: { notIn: scope.excludeUnitIds } } : {}),
    ...(scope.sellerId ? { sellerId: scope.sellerId } : {}),
  }
}

/**
 * Negociação comercialmente elegível dentro da janela. A mesma lista de status
 * usada pelo motor de comissão mantém metas/ranking alinhados ao fluxo comercial.
 */
function dealEligibleInWindow(w: AggregationWindow): Record<string, unknown> {
  return commissionEligibleDealWindowWhere(w)
}

// ── Agregadores por tipo ────────────────────────────────────────────────────────

async function aggSalesExchange(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  const value = await prisma.deal.count({
    where: { ...dealScopeWhere(scope), type: { in: ['VENDA', 'TROCA'] }, ...dealEligibleInWindow(w) },
  })
  return { value }
}

async function aggPurchase(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  const value = await prisma.deal.count({
    where: { ...dealScopeWhere(scope), type: 'COMPRA', ...dealEligibleInWindow(w) },
  })
  return { value }
}

async function aggService(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  // Serviços vendidos em negociações elegíveis no período.
  const value = await prisma.dealService.count({
    where: { deal: { ...dealScopeWhere(scope), ...dealEligibleInWindow(w) } },
  })
  return { value }
}

async function aggDocumentation(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  // Documentos/despachante concluídos = assinados ou arquivados na janela.
  const value = await prisma.dealDocument.count({
    where: {
      deal:   dealScopeWhere(scope),
      status: { in: ['ASSINADO', 'ARQUIVADO'] },
      OR: [
        { signedAt: { gte: w.start, lte: w.end } },
        { signedAt: null, createdAt: { gte: w.start, lte: w.end } },
      ],
    },
  })
  return { value }
}

async function aggExtendedWarranty(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  // Garantias estendidas vendidas = WarrantySale ATIVA em negociações elegíveis
  // no período (modelo dedicado, criado no módulo de Retorno/Garantia).
  const value = await prisma.warrantySale.count({
    where: {
      status: 'ATIVA',
      deal: { ...dealScopeWhere(scope), ...dealEligibleInWindow(w) },
    },
  })
  return { value }
}

async function aggReturn(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  // Retornos elegíveis = negociações elegíveis no período (no escopo) que
  // tiveram retorno financeiro registrado (returnNetValue > 0).
  const value = await prisma.deal.count({
    where: {
      ...dealScopeWhere(scope),
      returnNetValue: { gt: 0 },
      ...dealEligibleInWindow(w),
    },
  })
  return { value }
}

// ── Dispatch ────────────────────────────────────────────────────────────────────

const AGGREGATORS: Record<
  GoalType,
  (scope: AggregationScope, w: AggregationWindow) => Promise<AggregatorResult>
> = {
  SALES_EXCHANGE:    aggSalesExchange,
  PURCHASE:          aggPurchase,
  SERVICE:           aggService,
  DOCUMENTATION:     aggDocumentation,
  EXTENDED_WARRANTY: aggExtendedWarranty,
  RETURN:            aggReturn,
}

/** Calcula o valor realizado de uma meta no escopo/janela informados. */
export function aggregateAchieved(
  type: GoalType,
  scope: AggregationScope,
  window: AggregationWindow,
): Promise<AggregatorResult> {
  return AGGREGATORS[type](scope, window)
}
