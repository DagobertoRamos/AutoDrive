// =============================================================================
// POST /api/seller-queue/entries/:id/block — gerente bloqueia/libera vendedor.
// Gate: sellerQueue.manage. Justificativa obrigatória. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { blockSchema } from '@/lib/validators/seller-queue'
import { logQueueEvent } from '@/lib/seller-queue/queue'

type Ctx = { params: Promise<{ id: string }> }
const MGMT_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Apenas a gerência pode bloquear/liberar vendedores.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const entry = await prisma.sellerQueueEntry.findUnique({ where: { id } })
    if (!entry) return NextResponse.json({ success: false, error: 'Vendedor não encontrado na fila.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, entry.tenantId)) return forbiddenResponse('Vendedor de outra loja.')

    const d = blockSchema.parse(await req.json())
    await prisma.sellerQueueEntry.update({
      where: { id },
      data: { blocked: d.blocked, status: d.blocked ? 'BLOCKED' : 'WAITING', ...(d.blocked ? {} : { pausedAt: null }) },
    })
    await logQueueEvent({ tenantId, unitId: entry.unitId, queueId: entry.queueId, type: MGMT_ROLES.includes(user.role) ? 'MANAGER_OVERRIDE' : 'LEADER_OVERRIDE', sellerId: entry.sellerId, actorId: user.id, entryId: entry.id, reason: `${d.blocked ? 'bloqueio' : 'liberação'}: ${d.reason}` })
    await createSafeAuditLog({ userId: user.id, tenantId, action: d.blocked ? 'BLOCK' : 'UNBLOCK', entity: 'SellerQueueEntry', entityId: entry.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
