// =============================================================================
// GET /api/seller-queue/diagnostics — Diagnóstico dos colaboradores (GESTÃO).
// Read-only: dispositivos/push (MobileDevice: plataforma, ativo, visto por
// último) + presença na fila de hoje (status, última atividade). A UI cruza por
// sellerId com /callable. Gate: queue.sellers.manage. Tenant/unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, unitFromRequest } from '@/lib/seller-queue/queue'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'queue.sellers.manage')) return forbiddenResponse('Sem permissão para ver o diagnóstico.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=) ou tenha unidade vinculada.' }, { status: 400 })

  try {
    const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true } })
    const ids = users.map((u) => u.id)

    const devices = ids.length
      ? await prisma.mobileDevice.findMany({
          where: { userId: { in: ids }, revokedAt: null },
          select: { userId: true, platform: true, deviceName: true, isActive: true, lastSeenAt: true },
          orderBy: { lastSeenAt: 'desc' },
        })
      : []

    const devicesByUser: Record<string, { platform: string; deviceName: string | null; isActive: boolean; lastSeenAt: string | null }[]> = {}
    for (const d of devices) {
      (devicesByUser[d.userId] ??= []).push({ platform: d.platform, deviceName: d.deviceName, isActive: d.isActive, lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null })
    }

    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    const queueByUser: Record<string, { status: string; lastActiveAt: string | null }> = {}
    if (queue) {
      const entries = await prisma.sellerQueueEntry.findMany({ where: { queueId: queue.id }, select: { sellerId: true, status: true, lastActiveAt: true } })
      for (const e of entries) queueByUser[e.sellerId] = { status: e.status, lastActiveAt: e.lastActiveAt ? e.lastActiveAt.toISOString() : null }
    }

    return NextResponse.json({ success: true, data: { devicesByUser, queueByUser } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
