// =============================================================================
// goals/aggregators.ts — Cálculo de "realizado" por tipo de meta (AutoDrive)
//
// REGRA CENTRAL: toda agregação acontece aqui, no service layer — NUNCA no
// front-end. Cada GoalType tem um agregador dedicado que conta os eventos
// CONCLUÍDOS dentro da janela do período, respeitando o escopo (tenant/unidade/
// vendedor). Os filtros de escopo são aplicados de forma aditiva: quanto mais
// específico o escopo, mais restritiva a query.
// =============================================================================

import type { GoalType } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Escopo de agregação já resolvido (sellerId derivado do userId no service). */
export interface AggregationScope {
  tenantId: string | null
  unitId?:  string | null
  sellerId?: string | null
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
    ...(scope.sellerId ? { sellerId: scope.sellerId } : {}),
  }
}

/**
 * Negociação CONCLUÍDA dentro da janela.
 * Usa finalizedAt quando presente; cai para saleDate (deals importados de
 * planilha podem não ter finalizedAt) — ambos sob status FINALIZADA.
 */
function dealCompletedInWindow(w: AggregationWindow): Record<string, unknown> {
  return {
    status: 'FINALIZADA',
    OR: [
      { finalizedAt: { gte: w.start, lte: w.end } },
      { finalizedAt: null, saleDate: { gte: w.start, lte: w.end } },
    ],
  }
}

// ── Agregadores por tipo ────────────────────────────────────────────────────────

async function aggSalesExchange(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  const value = await prisma.deal.count({
    where: { ...dealScopeWhere(scope), type: { in: ['VENDA', 'TROCA'] }, ...dealCompletedInWindow(w) },
  })
  return { value }
}

async function aggPurchase(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  const value = await prisma.deal.count({
    where: { ...dealScopeWhere(scope), type: 'COMPRA', ...dealCompletedInWindow(w) },
  })
  return { value }
}

async function aggService(scope: AggregationScope, w: AggregationWindow): Promise<AggregatorResult> {
  // Serviços vendidos em negociações concluídas no período.
  const value = await prisma.dealService.count({
    where: { deal: { ...dealScopeWhere(scope), ...dealCompletedInWindow(w) } },
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
  // AMBÍGUO no modelo atual: não há registro explícito de "garantia vendida".
  // Interpretação provisória: itens de serviço cujo nome contém "garantia"
  // em negociações concluídas. Confirmar regra de negócio definitiva.
  const value = await prisma.dealService.count({
    where: {
      name: { contains: 'garantia', mode: 'insensitive' },
      deal: { ...dealScopeWhere(scope), ...dealCompletedInWindow(w) },
    },
  })
  return {
    value,
    note: 'Regra provisória: serviços com "garantia" no nome. Confirmar como registrar garantia estendida vendida.',
  }
}

async function aggReturn(_scope: AggregationScope, _w: AggregationWindow): Promise<AggregatorResult> {
  // AMBÍGUO: não existe registro comercial de "retorno" no schema atual
  // (MessageReturn é retorno de mensagens de WhatsApp, domínio diferente).
  // Retornamos 0 até a regra de negócio ser definida — sem inventar dados.
  return {
    value: 0,
    note: 'Tipo RETURN ainda não mapeado: definir o que conta como retorno concluído.',
  }
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
