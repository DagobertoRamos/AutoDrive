// =============================================================================
// seller-queue/quality.ts — pontuação de qualidade da fila de atendimento.
// FÓRMULA ÚNICA usada pelo ranking da fila (Visão Geral) e pelo ranking
// geral/da unidade (que SOMA estes pontos aos de venda). Mantida num só lugar
// para os dois rankings nunca divergirem.
// Obs.: SellerQueueAttendance.sellerId guarda o USER id (não Seller.id).
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface QueueScore {
  called: number
  finished: number
  reversoes: number
  timeouts: number
  posVendas: number
  conversoes: number
  /** % de atendimentos finalizados com cadastro completo (0–100). */
  qualidade: number
  avgAcceptSeconds: number | null
  /** Pontuação composta da fila (nunca negativa). */
  points: number
}

/** Pontuação composta (transparente): volume + conversão + pós-vendas +
 *  bônus de preenchimento − penalidades por reversão/timeout. */
export function queuePointsFor(a: { finished: number; conversoes: number; posVendas: number; fillRate: number; reversoes: number; timeouts: number }): number {
  return Math.max(0, a.finished * 10 + a.conversoes * 8 + a.posVendas * 6 + Math.round(a.fillRate * 20) - a.reversoes * 5 - a.timeouts * 2)
}

/**
 * Agrega a qualidade da fila por colaborador (chave = USER id) numa janela.
 * `unitId` opcional (null = tenant inteiro); `excludeUnitIds` remove unidades
 * que não participam do ranking (ex.: galpão).
 */
export async function computeQueueScores(opts: {
  tenantId: string
  unitId?: string | null
  window: { start: Date; end: Date }
  excludeUnitIds?: string[]
}): Promise<Map<string, QueueScore>> {
  const { tenantId, unitId = null, window, excludeUnitIds = [] } = opts
  const atts = await prisma.sellerQueueAttendance.findMany({
    where: {
      tenantId,
      ...(unitId ? { unitId } : {}),
      ...(!unitId && excludeUnitIds.length ? { unitId: { notIn: excludeUnitIds } } : {}),
      calledAt: { gte: window.start, lte: window.end },
    },
    select: { sellerId: true, status: true, type: true, result: true, notes: true, leadId: true, dealId: true, calledAt: true, acceptedAt: true },
    take: 20000,
  })

  type Agg = { called: number; finished: number; reversoes: number; timeouts: number; posVendas: number; conversoes: number; fillComplete: number; acceptMs: number; acceptN: number }
  const by = new Map<string, Agg>()
  const g = (id: string) => { let a = by.get(id); if (!a) { a = { called: 0, finished: 0, reversoes: 0, timeouts: 0, posVendas: 0, conversoes: 0, fillComplete: 0, acceptMs: 0, acceptN: 0 }; by.set(id, a) } return a }

  for (const a of atts) {
    const x = g(a.sellerId); x.called++
    if (a.status === 'FINISHED') {
      x.finished++
      if (a.type === 'AFTER_SALES') x.posVendas++
      if (a.dealId || a.result === 'CONVERTED_TO_NEGOTIATION') x.conversoes++
      // Preenchimento completo: tipo + resultado + observações + lead vinculado.
      if (a.type && a.result && a.notes && a.notes.trim().length > 0 && a.leadId) x.fillComplete++
    } else if (a.status === 'CANCELED' || a.status === 'REJECTED') x.reversoes++
    else if (a.status === 'EXPIRED') x.timeouts++
    if (a.acceptedAt) { x.acceptMs += a.acceptedAt.getTime() - a.calledAt.getTime(); x.acceptN++ }
  }

  const out = new Map<string, QueueScore>()
  for (const [id, a] of by) {
    const fillRate = a.finished ? a.fillComplete / a.finished : 0
    out.set(id, {
      called: a.called,
      finished: a.finished,
      reversoes: a.reversoes,
      timeouts: a.timeouts,
      posVendas: a.posVendas,
      conversoes: a.conversoes,
      qualidade: Math.round(fillRate * 100),
      avgAcceptSeconds: a.acceptN ? Math.round(a.acceptMs / a.acceptN / 1000) : null,
      points: queuePointsFor({ finished: a.finished, conversoes: a.conversoes, posVendas: a.posVendas, fillRate, reversoes: a.reversoes, timeouts: a.timeouts }),
    })
  }
  return out
}
