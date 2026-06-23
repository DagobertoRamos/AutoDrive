// =============================================================================
// POST /api/seller-queue/resume — vendedor retorna da pausa (revalida presença).
// Gate: sellerQueue.checkIn. Volta ao fim da fila (anti-gaming da pausa).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { resumeSchema } from '@/lib/validators/seller-queue'
import { queueDate, getUnitConfig, toPresenceConfig, nextPosition, recordPresence, logQueueEvent } from '@/lib/seller-queue/queue'
import { getActiveQueueBlock, blockMessage } from '@/lib/seller-queue/penalty'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const MGMT_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.checkIn')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.checkIn'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = user.unitId
  if (!unitId) return forbiddenResponse('Seu usuário não tem unidade vinculada.')
  const block = await getActiveQueueBlock(tenantId, unitId, user.id)
  if (block) return NextResponse.json({ success: false, error: blockMessage(block), block: { type: block.type, endsAt: block.endsAt } }, { status: 403 })

  try {
    const d = resumeSchema.parse(await req.json().catch(() => ({})))
    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    const entry = queue ? await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId: user.id } } }) : null
    if (!entry || entry.status !== 'PAUSED') {
      return NextResponse.json({ success: false, error: 'Você não está em pausa.' }, { status: 409 })
    }
    if (entry.blocked) return forbiddenResponse('Vendedor bloqueado na fila.')

    // Revalida presença no retorno.
    let override: { byId: string; reason: string; method: 'MANAGER_OVERRIDE' | 'LEADER_OVERRIDE' } | null = null
    if (d.override) {
      if (!canAccessModule(user.role, 'sellerQueue.override')) return forbiddenResponse('Sem permissão para liberar presença.')
      if (!d.overrideReason?.trim()) return NextResponse.json({ success: false, error: 'Justificativa obrigatória.' }, { status: 400 })
      override = { byId: user.id, reason: d.overrideReason.trim(), method: MGMT_ROLES.includes(user.role) ? 'MANAGER_OVERRIDE' : 'LEADER_OVERRIDE' }
    }
    const cfg = await getUnitConfig(tenantId, unitId)
    const presence = await recordPresence({ tenantId, unitId, sellerId: user.id, context: 'RESUME', cfg: toPresenceConfig(cfg), input: d, override })
    if (!presence.ok) return NextResponse.json({ success: false, error: presence.reason ?? 'Presença não validada.', presence }, { status: 422 })

    await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'WAITING', pausedAt: null, position: await nextPosition(queue!.id), lastActiveAt: new Date() } })
    await logQueueEvent({ tenantId, unitId, queueId: queue!.id, type: 'RESUME', sellerId: user.id, actorId: user.id, entryId: entry.id, reason: `presence:${presence.method}` })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'RESUME', entity: 'SellerQueueEntry', entityId: entry.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { presence } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
