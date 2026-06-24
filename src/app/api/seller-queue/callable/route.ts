// =============================================================================
// GET /api/seller-queue/callable — colaboradores que podem ser chamados na
// unidade (responsável / pós-vendas / superior / vendedores). Inclui o cargo e
// se está na fila hoje. Gate: sellerQueue.view. Tenant/unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, unitFromRequest } from '@/lib/seller-queue/queue'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })

  try {
    const users = await prisma.user.findMany({
      where: { tenantId, unitId, status: 'ATIVO', role: { notIn: ['MASTER', 'ADM'] } },
      select: { id: true, name: true, role: true, position: { select: { name: true } } },
      orderBy: { name: 'asc' },
    })

    // Estado na fila de hoje (para mostrar quem está disponível/ocupado).
    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    const entryStatus = new Map<string, string>()
    if (queue) {
      const entries = await prisma.sellerQueueEntry.findMany({ where: { queueId: queue.id }, select: { sellerId: true, status: true, blocked: true } })
      entries.forEach((e) => entryStatus.set(e.sellerId, e.blocked ? 'BLOCKED' : e.status))
    }

    const data = users.map((u) => ({
      sellerId: u.id,
      name: u.name,
      role: u.role,
      positionName: u.position?.name ?? null,
      queueStatus: entryStatus.get(u.id) ?? null, // null = fora da fila
      inQueue: entryStatus.get(u.id) === 'WAITING',
    }))
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
