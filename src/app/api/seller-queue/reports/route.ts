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
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.reports')) return forbiddenResponse('Sem acesso aos relatórios.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.reports'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  const days = Math.min(Math.max(Number(sp.get('days')) || 7, 1), 90)
  // Período custom (from/to ISO) tem prioridade sobre days.
  const fromParam = sp.get('from'), toParam = sp.get('to')
  const since = fromParam ? new Date(fromParam) : new Date(Date.now() - days * 86400000)
  const until = toParam ? new Date(new Date(toParam).getTime() + 86400000 - 1) : null // fim do dia
  const dateRange = until ? { gte: since, lte: until } : { gte: since }
  // Filtro opcional por vendedor.
  const sellerFilter = sp.get('sellerId') || null
  // Quem enxerga a loja inteira pode ver o consolidado por unidade.
  const tenantWide = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO'].includes(user.role)

  try {
    const attWhere = { tenantId, unitId, calledAt: dateRange, ...(sellerFilter ? { sellerId: sellerFilter } : {}) }
    const [attendances, arrivals, fraud, penalties] = await Promise.all([
      prisma.sellerQueueAttendance.findMany({ where: attWhere, select: { sellerId: true, status: true, calledAt: true, acceptedAt: true }, take: 5000 }),
      prisma.sellerQueueCustomerArrival.findMany({ where: { tenantId, unitId, createdAt: dateRange }, select: { recurring: true, createdAt: true }, take: 5000 }),
      prisma.sellerQueueFraudFlag.findMany({ where: { tenantId, unitId, status: 'OPEN', createdAt: dateRange }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.sellerQueuePenalty.findMany({ where: { tenantId, unitId, active: true, createdAt: dateRange }, take: 500 }),
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

    // Consolidado por unidade (loja inteira) — só para quem enxerga o tenant.
    let byUnit: { unitId: string; unitName: string; called: number; finished: number; timeouts: number }[] = []
    if (tenantWide) {
      const all = await prisma.sellerQueueAttendance.findMany({ where: { tenantId, calledAt: dateRange, ...(sellerFilter ? { sellerId: sellerFilter } : {}) }, select: { unitId: true, status: true }, take: 20000 })
      const um = new Map<string, { called: number; finished: number; timeouts: number }>()
      for (const a of all) {
        let u = um.get(a.unitId); if (!u) { u = { called: 0, finished: 0, timeouts: 0 }; um.set(a.unitId, u) }
        u.called++
        if (a.status === 'FINISHED') u.finished++
        else if (a.status === 'EXPIRED') u.timeouts++
      }
      const unitIds = [...um.keys()]
      const unitNames = new Map<string, string>()
      if (unitIds.length) {
        const us = await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } })
        us.forEach((u) => unitNames.set(u.id, u.name))
      }
      byUnit = unitIds.map((id) => ({ unitId: id, unitName: unitNames.get(id) ?? id, ...um.get(id)! })).sort((x, y) => y.finished - x.finished)
    }

    return NextResponse.json({
      success: true,
      data: {
        days,
        tenantWide,
        byUnit,
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
