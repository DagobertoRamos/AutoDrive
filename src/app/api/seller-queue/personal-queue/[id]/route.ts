// =============================================================================
// POST /api/seller-queue/personal-queue/:id — ações num item da fila individual.
// Body: { action: 'start' | 'transfer' | 'cancel', toUserId? }
//   start    : sellerQueue.attend — inicia o atendimento do item (responsável ou gestão).
//   transfer : sellerQueue.manage — transfere para outro colaborador (gestão).
//   cancel   : sellerQueue.attend — cancela (o responsável ou a gestão).
// Tenant-scoped. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { startPersonalItem, transferPersonalItem, cancelPersonalItem } from '@/lib/seller-queue/personal-queue'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.attend')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.attend'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params

  try {
    const b = await req.json().catch(() => ({}))
    const action = String(b?.action ?? '')

    if (action === 'start') {
      const r = await startPersonalItem({ tenantId, unitId: user.unitId ?? '', itemId: id, actorId: user.id, actorRole: user.role })
      if (!r.ok) return NextResponse.json({ success: false, error: r.reason ?? 'Não foi possível iniciar.' }, { status: 409 })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'PERSONAL_QUEUE_START', entity: 'AgentPersonalQueueItem', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, data: { attendanceId: r.attendanceId } })
    }

    if (action === 'transfer') {
      if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Apenas a gestão pode transferir.')
      const toUserId = String(b?.toUserId ?? '')
      if (!toUserId) return NextResponse.json({ success: false, error: 'Informe o colaborador destino (toUserId).' }, { status: 400 })
      const r = await transferPersonalItem({ tenantId, itemId: id, toUserId, actorId: user.id })
      if (!r.ok) return NextResponse.json({ success: false, error: r.reason ?? 'Não foi possível transferir.' }, { status: 409 })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'PERSONAL_QUEUE_TRANSFER', entity: 'AgentPersonalQueueItem', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }

    if (action === 'cancel') {
      const r = await cancelPersonalItem({ tenantId, itemId: id, actorId: user.id, actorRole: user.role })
      if (!r.ok) return NextResponse.json({ success: false, error: r.reason ?? 'Não foi possível cancelar.' }, { status: 409 })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'PERSONAL_QUEUE_CANCEL', entity: 'AgentPersonalQueueItem', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Ação inválida (start/transfer/cancel).' }, { status: 400 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
