// =============================================================================
// /api/seller-queue/vacation — Modo Férias (auto-serviço do vendedor).
//   GET  : { onVacation } do próprio usuário
//   POST : { on: boolean } liga/desliga. Ao ligar, sai da fila de hoje.
// Gate: sellerQueue.view. Cada um controla só o próprio modo férias.
// Persistido em SellerQueueUnitConfig.config.vacations[sellerId] (sem migration).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, unitFromRequest, getUnitConfig, logQueueEvent } from '@/lib/seller-queue/queue'
import { getVacations, isOnVacation } from '@/lib/seller-queue/automation'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: true, data: { onVacation: false } })
  try {
    const cfg = await getUnitConfig(tenantId, unitId)
    return NextResponse.json({ success: true, data: { onVacation: isOnVacation(cfg?.config, user.id) } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Seu usuário não tem unidade vinculada.' }, { status: 400 })

  try {
    const body = await req.json().catch(() => ({}))
    const on = !!body?.on
    const existing = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } }, select: { config: true } })
    const vacations = getVacations(existing?.config)
    if (on) vacations[user.id] = { since: new Date().toISOString() }
    else delete vacations[user.id]
    const mergedConfig = { ...((existing?.config as Record<string, unknown>) ?? {}), vacations }
    await prisma.sellerQueueUnitConfig.upsert({
      where: { tenantId_unitId: { tenantId, unitId } },
      update: { config: mergedConfig, updatedById: user.id },
      create: { tenantId, unitId, config: mergedConfig, updatedById: user.id },
    })

    // Ao entrar de férias, sai da fila de hoje (se estiver nela).
    if (on) {
      const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
      if (queue) {
        const entry = await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId: user.id } }, select: { id: true, status: true } })
        if (entry && entry.status !== 'LEFT') {
          await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'LEFT', leftAt: new Date() } }).catch(() => {})
          await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CHECK_OUT', sellerId: user.id, actorId: user.id, entryId: entry.id, reason: 'modo férias ativado' })
        }
      }
    }

    await createSafeAuditLog({ userId: user.id, tenantId, action: on ? 'VACATION_ON' : 'VACATION_OFF', entity: 'SellerQueueUnitConfig', entityId: user.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { onVacation: on } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
