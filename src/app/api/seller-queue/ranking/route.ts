// =============================================================================
// GET /api/seller-queue/ranking — ranking de qualidade dos vendedores na fila.
// Gate: sellerQueue.view (todos veem — é motivacional). Unit-scoped. ?days=30.
// Métricas por vendedor: atendimentos, preenchimento (qualidade do cadastro),
// reversões (cancelados/recusados), pós-vendas, conversões, tempo médio de
// aceite → pontuação composta transparente.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest } from '@/lib/seller-queue/queue'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 30, 1), 365)
  const since = new Date(Date.now() - days * 86400000)

  try {
    const atts = await prisma.sellerQueueAttendance.findMany({
      where: { tenantId, unitId, calledAt: { gte: since } },
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

    const ids = [...by.keys()]
    const names = new Map<string, string>()
    if (ids.length) {
      const us = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      us.forEach((u) => names.set(u.id, u.name))
    }

    const rows = ids.map((id) => {
      const a = by.get(id)!
      const fillRate = a.finished ? a.fillComplete / a.finished : 0
      const qualidade = Math.round(fillRate * 100)
      // Pontuação composta (transparente): volume + conversão + pós-vendas +
      // bônus de preenchimento − penalidades por reversão/timeout.
      const points = Math.max(0, a.finished * 10 + a.conversoes * 8 + a.posVendas * 6 + Math.round(fillRate * 20) - a.reversoes * 5 - a.timeouts * 2)
      return {
        sellerId: id, sellerName: names.get(id) ?? id,
        finished: a.finished, called: a.called, reversoes: a.reversoes, timeouts: a.timeouts,
        posVendas: a.posVendas, conversoes: a.conversoes, qualidade,
        avgAcceptSeconds: a.acceptN ? Math.round(a.acceptMs / a.acceptN / 1000) : null,
        points,
      }
    }).sort((x, y) => y.points - x.points || y.finished - x.finished)

    return NextResponse.json({ success: true, data: { days, ranking: rows } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
