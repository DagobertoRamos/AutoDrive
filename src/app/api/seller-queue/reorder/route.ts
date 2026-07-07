// =============================================================================
// POST /api/seller-queue/reorder — gerente reordena a fila (com justificativa).
// Gate: sellerQueue.manage. Move 1 posição (up/down) trocando com o vizinho.
// Auditado (QUEUE_REORDERED). Reordenar exige justificativa.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { reorderSchema } from '@/lib/validators/seller-queue'
import { logQueueEvent, isUserQueueResponsible } from '@/lib/seller-queue/queue'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const isResponsible = await isUserQueueResponsible({ id: user.id, role: user.role, tenantId: user.tenantId ?? '', unitId: user.unitId })
  if (!isResponsible && !await canAccessModuleForUser(user, 'queue.reorder')) return forbiddenResponse('Sem permissão para reordenar a fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const d = reorderSchema.parse(await req.json())
    const entry = await prisma.sellerQueueEntry.findUnique({ where: { id: d.entryId } })
    if (!entry) return NextResponse.json({ success: false, error: 'Vendedor não encontrado na fila.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, entry.tenantId)) return forbiddenResponse('Vendedor de outra loja.')

    // Vizinho na direção pedida (entre os que estão na fila, exclui LEFT).
    const neighbor = await prisma.sellerQueueEntry.findFirst({
      where: { queueId: entry.queueId, status: { notIn: ['LEFT'] }, position: d.direction === 'up' ? { lt: entry.position } : { gt: entry.position } },
      orderBy: { position: d.direction === 'up' ? 'desc' : 'asc' },
    })
    if (!neighbor) return NextResponse.json({ success: false, error: 'Já está no limite da fila.' }, { status: 409 })

    await prisma.$transaction([
      prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { position: neighbor.position } }),
      prisma.sellerQueueEntry.update({ where: { id: neighbor.id }, data: { position: entry.position } }),
    ])
    await logQueueEvent({ tenantId, unitId: entry.unitId, queueId: entry.queueId, type: 'QUEUE_REORDERED', sellerId: entry.sellerId, actorId: user.id, entryId: entry.id, reason: d.reason })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'REORDER', entity: 'SellerQueueEntry', entityId: entry.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
