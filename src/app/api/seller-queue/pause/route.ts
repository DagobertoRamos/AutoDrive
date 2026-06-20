// =============================================================================
// POST /api/seller-queue/pause — vendedor pausa (sai da rotação sem sair da fila).
// Gate: sellerQueue.checkIn.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { pauseSchema } from '@/lib/validators/seller-queue'
import { queueDate, logQueueEvent } from '@/lib/seller-queue/queue'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.checkIn')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.checkIn'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = user.unitId
  if (!unitId) return forbiddenResponse('Seu usuário não tem unidade vinculada.')
  try {
    const d = pauseSchema.parse(await req.json().catch(() => ({})))
    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    const entry = queue ? await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId: user.id } } }) : null
    if (!entry || !['WAITING', 'NEXT'].includes(entry.status)) {
      return NextResponse.json({ success: false, error: 'Só é possível pausar quando você está aguardando na fila.' }, { status: 409 })
    }
    await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'PAUSED', pausedAt: new Date() } })
    await logQueueEvent({ tenantId, unitId, queueId: queue!.id, type: 'PAUSE', sellerId: user.id, actorId: user.id, entryId: entry.id, reason: d.reason ?? null })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'PAUSE', entity: 'SellerQueueEntry', entityId: entry.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
