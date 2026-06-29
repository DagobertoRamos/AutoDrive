// =============================================================================
// POST /api/seller-queue/check-in — vendedor entra na fila (presença validada).
// Gate: sellerQueue.checkIn. Tenant/unit-scoped. Presença por evento (GPS/QR/
// device) ou override de gerente/líder com justificativa. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { checkInSchema } from '@/lib/validators/seller-queue'
import { getUnitConfig, toPresenceConfig, getOrCreateQueue, nextPosition, recordPresence, logQueueEvent } from '@/lib/seller-queue/queue'
import { isQueueOpenNow, isOnVacation } from '@/lib/seller-queue/automation'
import { getActiveQueueBlock, blockMessage } from '@/lib/seller-queue/penalty'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const MGMT_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.checkIn')) return forbiddenResponse('Sem permissão para entrar na fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.checkIn'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = user.unitId
  if (!unitId) return forbiddenResponse('Seu usuário não tem unidade vinculada — necessária para a fila.')
  const sellerId = user.id

  // Bloqueio automático (cooldown/diário) por reincidência — barra antes do GPS.
  const block = await getActiveQueueBlock(tenantId, unitId, sellerId)
  if (block) return NextResponse.json({ success: false, error: blockMessage(block), block: { type: block.type, endsAt: block.endsAt } }, { status: 403 })

  try {
    const d = checkInSchema.parse(await req.json().catch(() => ({})))

    // Override (gerente/líder) exige permissão + justificativa.
    let override: { byId: string; reason: string; method: 'MANAGER_OVERRIDE' | 'LEADER_OVERRIDE' } | null = null
    if (d.override) {
      if (!canAccessModule(user.role, 'sellerQueue.override')) return forbiddenResponse('Sem permissão para liberar presença manualmente.')
      if (!d.overrideReason?.trim()) return NextResponse.json({ success: false, error: 'Justificativa obrigatória para liberar presença.' }, { status: 400 })
      override = { byId: user.id, reason: d.overrideReason.trim(), method: MGMT_ROLES.includes(user.role) ? 'MANAGER_OVERRIDE' : 'LEADER_OVERRIDE' }
    }

    const cfg = await getUnitConfig(tenantId, unitId)
    // Modo férias: vendedor de férias não entra na fila.
    if (isOnVacation(cfg?.config, sellerId)) {
      return NextResponse.json({ success: false, error: 'Você está em modo férias. Desative em Configurações para entrar na fila.' }, { status: 409 })
    }
    // Fila com horário automático: barra check-in fora do expediente.
    const cfgX = (cfg?.config as Record<string, unknown> | undefined) ?? {}
    if (cfgX.autoSchedule && !isQueueOpenNow(cfg?.openTime, cfg?.closeTime, cfg?.allowedDays)) {
      return NextResponse.json({ success: false, error: 'A fila está fechada agora (fora do horário de funcionamento).' }, { status: 409 })
    }
    const presence = await recordPresence({ tenantId, unitId, sellerId, context: 'CHECK_IN', cfg: toPresenceConfig(cfg), input: d, override })
    if (!presence.ok) {
      return NextResponse.json({ success: false, error: presence.reason ?? 'Presença não validada.', presence }, { status: 422 })
    }

    const queue = await getOrCreateQueue(tenantId, unitId)
    const existing = await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId } } })

    if (existing?.blocked || existing?.status === 'BLOCKED') {
      return forbiddenResponse('Vendedor bloqueado na fila — fale com a gerência.')
    }

    let entry
    if (existing) {
      const active = ['WAITING', 'NEXT', 'CALLED', 'ACCEPTED', 'IN_ATTENDANCE', 'PAUSED'].includes(existing.status)
      entry = active
        ? existing // idempotente: já está na fila
        : await prisma.sellerQueueEntry.update({
            where: { id: existing.id },
            data: { status: 'WAITING', position: await nextPosition(queue.id), joinedAt: new Date(), leftAt: null, lastActiveAt: new Date() },
          })
    } else {
      entry = await prisma.sellerQueueEntry.create({
        data: { tenantId, unitId, queueId: queue.id, sellerId, status: 'WAITING', position: await nextPosition(queue.id), lastActiveAt: new Date() },
      })
    }

    await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CHECK_IN', sellerId, actorId: user.id, entryId: entry.id, reason: override ? `override:${override.method}` : `presence:${presence.method}` })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CHECK_IN', entity: 'SellerQueueEntry', entityId: entry.id, userName: user.name, userRole: user.role })

    return NextResponse.json({ success: true, data: { entryId: entry.id, queueId: queue.id, status: entry.status, position: entry.position, presence } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
