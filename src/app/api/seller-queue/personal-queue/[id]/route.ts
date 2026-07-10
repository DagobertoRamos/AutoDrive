// =============================================================================
// POST /api/seller-queue/personal-queue/:id — ações num item da fila individual.
// Body: { action: 'start' | 'transfer' | 'cancel' | 'priority' | 'reschedule', toUserId? }
// DECISÃO DE PRODUTO: SÓ A GESTÃO (gerente+) puxa/atende/transfere/cancela itens
// da fila individual — o vendedor apenas VÊ a sua (GET). Evita o vendedor
// manipular a própria fila (anti-fraude). Gate único: sellerQueue.manage.
// Tenant-scoped. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { startPersonalItem, transferPersonalItem, cancelPersonalItem, setPersonalItemPriority, reschedulePersonalItem } from '@/lib/seller-queue/personal-queue'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  // Só a gestão opera a fila individual (puxar/atender/transferir/cancelar).
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Apenas a gestão pode operar a fila individual.')
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

    if (action === 'priority') {
      const priority = Number(b?.priority)
      if (!Number.isFinite(priority)) return NextResponse.json({ success: false, error: 'Prioridade inválida.' }, { status: 400 })
      const r = await setPersonalItemPriority({ tenantId, itemId: id, priority, actorId: user.id, actorRole: user.role })
      if (!r.ok) return NextResponse.json({ success: false, error: r.reason ?? 'Não foi possível alterar a prioridade.' }, { status: 409 })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'PERSONAL_QUEUE_PRIORITY', entity: 'AgentPersonalQueueItem', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, data: { priority: r.priority } })
    }

    if (action === 'reschedule') {
      const r = await reschedulePersonalItem({ tenantId, itemId: id, actorId: user.id, actorRole: user.role })
      if (!r.ok) return NextResponse.json({ success: false, error: r.reason ?? 'Não foi possível reagendar.' }, { status: 409 })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'PERSONAL_QUEUE_RESCHEDULE', entity: 'AgentPersonalQueueItem', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Ação inválida (start/transfer/cancel/priority/reschedule).' }, { status: 400 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
