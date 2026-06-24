// =============================================================================
// GET /api/seller-queue/attendances — lista atendimentos do dia/unidade.
// Gate: sellerQueue.view. ?active=true (CALLED/ACCEPTED/IN_ATTENDANCE) ou todos
// do dia. Usado no painel da unidade e no histórico. Tenant/unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate , unitFromRequest } from '@/lib/seller-queue/queue'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  const active = sp.get('active') === 'true'
  try {
    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    if (!queue) return NextResponse.json({ success: true, data: [] })
    const rows = await prisma.sellerQueueAttendance.findMany({
      where: { queueId: queue.id, ...(active ? { status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } } : {}) },
      orderBy: { calledAt: 'desc' }, take: 300,
      include: { arrival: { select: { customerName: true, customerPhone: true, recurring: true } } },
    })
    const names = new Map<string, string>()
    if (rows.length) {
      const us = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sellerId))] } }, select: { id: true, name: true } })
      us.forEach((u) => names.set(u.id, u.name))
    }
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id, sellerId: r.sellerId, sellerName: names.get(r.sellerId) ?? r.sellerId,
        status: r.status, type: r.type, result: r.result, calledAt: r.calledAt, acceptDeadline: r.acceptDeadline,
        acceptedAt: r.acceptedAt, finishedAt: r.finishedAt, leadId: r.leadId, arrival: r.arrival,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
