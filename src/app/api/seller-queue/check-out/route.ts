// =============================================================================
// POST /api/seller-queue/check-out — vendedor sai da fila. Gate: sellerQueue.checkIn.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { checkOutSchema } from '@/lib/validators/seller-queue'
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
    const d = checkOutSchema.parse(await req.json().catch(() => ({})))
    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    const entry = queue ? await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId: user.id } } }) : null
    if (!entry || entry.status === 'LEFT') return NextResponse.json({ success: false, error: 'Você não está na fila.' }, { status: 404 })

    await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'LEFT', leftAt: new Date() } })
    await logQueueEvent({ tenantId, unitId, queueId: queue!.id, type: 'CHECK_OUT', sellerId: user.id, actorId: user.id, entryId: entry.id, reason: d.reason ?? null })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CHECK_OUT', entity: 'SellerQueueEntry', entityId: entry.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
