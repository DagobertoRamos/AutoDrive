// =============================================================================
// GET /api/seller-queue/check-turn — "Verificar vez" (pop-up do vendedor da vez).
// Gate: sellerQueue.view. Read-only. Diz, para o solicitante:
//   - quem é o vendedor da vez (cliente de porta / fila principal);
//   - a posição do solicitante na fila;
//   - se ele é o da vez (→ pode Iniciar atendimento);
//   - se outro é o da vez (→ pode Chamar o vendedor da vez);
//   - se está inelegível, o motivo (pausado/atendendo/fora/não participa).
// Tenant/unit-scoped (mesmas regras do /current). NÃO altera a fila.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, unitFromRequest } from '@/lib/seller-queue/queue'
import { assertModuleEnabled, getDisabledModules } from '@/lib/tenant-modules'
import { computeCheckTurn } from '@/lib/seller-queue/check-turn'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=) ou tenha unidade vinculada.' }, { status: 400 })

  try {
    // Pode entrar na fila? (cargo + não removido + módulo ligado) — para dar o
    // motivo certo a quem não participa da fila.
    let canCheckIn = canAccessModule(user.role, 'sellerQueue.checkIn')
    if (canCheckIn) {
      const [denied, tenantDisabled] = await Promise.all([
        prisma.userModule.findFirst({ where: { userId: user.id, moduleKey: 'sellerQueue.checkIn', allowed: false }, select: { id: true } }),
        getDisabledModules(tenantId),
      ])
      if (denied || tenantDisabled.includes('sellerQueue.checkIn')) canCheckIn = false
    }
    const canManage = canAccessModule(user.role, 'sellerQueue.manage')

    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    if (!queue) {
      return NextResponse.json({ success: true, data: {
        eligible: false, reason: null, isCurrentTurn: false, userPosition: 0, currentSeller: null,
        counts: { available: 0, paused: 0, attending: 0, waiting: 0 }, nextUp: [],
        canStartAttendance: false, canCallCurrentSeller: false, canManage, message: 'A fila ainda não foi aberta hoje.',
      } })
    }

    const entries = await prisma.sellerQueueEntry.findMany({
      where: { queueId: queue.id, status: { notIn: ['LEFT'] } },
      orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
      select: { sellerId: true, status: true, blocked: true },
    })
    const names = new Map<string, string>()
    if (entries.length) {
      const us = await prisma.user.findMany({ where: { id: { in: entries.map((e) => e.sellerId) } }, select: { id: true, name: true } })
      us.forEach((u) => names.set(u.id, u.name))
    }

    const data = computeCheckTurn({
      entries,
      userId: user.id,
      nameOf: (id) => names.get(id) ?? '—',
      canCheckIn,
      canManage,
    })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
