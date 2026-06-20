// =============================================================================
// GET /api/seller-queue/reports — relatórios da fila (últimos N dias).
// Gate: sellerQueue.reports. ?days=7 &unitId=. Tenant/unit-scoped.
// Retorna: por vendedor (atendidos/timeouts/recusas + tempo médio de aceite),
// clientes presenciais (total/recorrentes), suspeitas (fraude) e penalidades.
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
  if (!canAccessModule(user.role, 'sellerQueue.reports')) return forbiddenResponse('Sem acesso aos relatórios.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  const days = Math.min(Math.max(Number(sp.get('days')) || 7, 1), 90)
  const since = new Date(Date.now() - days * 86400000)

  try {
    const [attendances, arrivals, fraud, penalties] = await Promise.all([
      prisma.sellerQueueAttendance.findMany({ where: { tenantId, unitId, calledAt: { gte: since } }, select: { sellerId: true, status: true, calledAt: true, acceptedAt: true }, take: 5000 }),
      prisma.sellerQueueCustomerArrival.findMany({ where: { tenantId, unitId, createdAt: { gte: since } }, select: { recurring: true, createdAt: true }, take: 5000 }),
      prisma.sellerQueueFraudFlag.findMany({ where: { tenantId, unitId, status: 'OPEN', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.sellerQueuePenalty.findMany({ where: { tenantId, unitId, active: true, createdAt: { gte: since } }, take: 500 }),
    ])

    // Agrega por vendedor.
    type Agg = { finished: number; timeouts: number; rejected: number; called: number; acceptMs: number; acceptN: number }
    const by = new Map<string, Agg>()
    const g = (id: string) => { let a = by.get(id); if (!a) { a = { finished: 0, timeouts: 0, rejected: 0, called: 0, acceptMs: 0, acceptN: 0 }; by.set(id, a) } return a }
    for (const a of attendances) {
      const x = g(a.sellerId); x.called++
      if (a.status === 'FINISHED') x.finished++
      else if (a.status === 'EXPIRED') x.timeouts++
      else if (a.status === 'REJECTED') x.rejected++
      if (a.acceptedAt) { x.acceptMs += a.acceptedAt.getTime() - a.calledAt.getTime(); x.acceptN++ }
    }
    const sellerIds = [...by.keys()]
    const names = new Map<string, string>()
    if (sellerIds.length) {
      const us = await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } })
      us.forEach((u) => names.set(u.id, u.name))
    }
    const bySeller = sellerIds.map((id) => {
      const a = by.get(id)!
      return { sellerId: id, sellerName: names.get(id) ?? id, finished: a.finished, timeouts: a.timeouts, rejected: a.rejected, called: a.called, avgAcceptSeconds: a.acceptN ? Math.round(a.acceptMs / a.acceptN / 1000) : null }
    }).sort((x, y) => y.finished - x.finished)

    return NextResponse.json({
      success: true,
      data: {
        days,
        totals: {
          arrivals: arrivals.length,
          recurring: arrivals.filter((a) => a.recurring).length,
          attendances: attendances.length,
          finished: attendances.filter((a) => a.status === 'FINISHED').length,
          timeouts: attendances.filter((a) => a.status === 'EXPIRED').length,
        },
        bySeller,
        fraudFlags: fraud,
        penalties,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
