// =============================================================================
// POST /api/seller-queue/admin-reset — limpar/reiniciar a fila pela tela.
//   action 'resetToday' (gerente+/ADM): tira todos da fila de hoje, cancela os
//     clientes pendentes e APAGA o log/atendimentos/chegadas/penalidades de HOJE.
//   action 'wipe' (somente MASTER): apaga TODO o histórico da fila da unidade.
// Mantém colaboradores e configurações. Auditado. Tenant/unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, unitFromRequest } from '@/lib/seller-queue/queue'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action === 'wipe' ? 'wipe' : 'resetToday'

    // Permissões: reiniciar o dia = gestão (gerente+/ADM). Apagar tudo = só MASTER.
    if (action === 'wipe') {
      if (user.role !== 'MASTER') return forbiddenResponse('Apagar todo o histórico é exclusivo do MASTER.')
    } else {
      if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Apenas a gestão (gerente/ADM) pode reiniciar a fila.')
    }

    const removed: Record<string, number> = {}

    if (action === 'wipe') {
      const w = { tenantId, unitId }
      removed.eventos = (await prisma.sellerQueueEvent.deleteMany({ where: w })).count
      removed.fraudes = (await prisma.sellerQueueFraudFlag.deleteMany({ where: w })).count
      removed.penalidades = (await prisma.sellerQueuePenalty.deleteMany({ where: w })).count
      removed.atendimentos = (await prisma.sellerQueueAttendance.deleteMany({ where: w })).count
      removed.chegadas = (await prisma.sellerQueueCustomerArrival.deleteMany({ where: w })).count
      removed.entradas = (await prisma.sellerQueueEntry.deleteMany({ where: w })).count
      removed.filas = (await prisma.sellerQueue.deleteMany({ where: w })).count
    } else {
      // Reinicia o dia: limpa a fila de HOJE (mantém histórico de dias anteriores).
      const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
      if (queue) {
        const qw = { queueId: queue.id }
        removed.eventos = (await prisma.sellerQueueEvent.deleteMany({ where: qw })).count
        removed.atendimentos = (await prisma.sellerQueueAttendance.deleteMany({ where: qw })).count
        removed.chegadas = (await prisma.sellerQueueCustomerArrival.deleteMany({ where: qw })).count
        removed.entradas = (await prisma.sellerQueueEntry.deleteMany({ where: qw })).count
      }
      // Penalidades/bloqueios de hoje (desativa para liberar geral).
      removed.penalidades = (await prisma.sellerQueuePenalty.deleteMany({ where: { tenantId, unitId, createdAt: { gte: queueDate() } } })).count
    }

    await createSafeAuditLog({ userId: user.id, tenantId, action: action === 'wipe' ? 'QUEUE_WIPE' : 'QUEUE_RESET', entity: 'SellerQueue', entityId: unitId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { action, removed } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
