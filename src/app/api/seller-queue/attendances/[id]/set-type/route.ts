// =============================================================================
// POST /api/seller-queue/attendances/[id]/set-type — grava a NATUREZA da visita
// (visitType) no atendimento. Gate: sellerQueue.attend (próprio) ou .manage.
// Valida que o tipo está ATIVO na config da unidade. "Outro" exige descrição.
// Tenant-scoped; auditado. Cliente é opcional no início; obrigatório no finish.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { ownsTenant } from '@/lib/finance/finance-service'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { getUnitConfig, logQueueEvent } from '@/lib/seller-queue/queue'
import { readAttendanceTypesConfig, findActiveType } from '@/lib/seller-queue/attendance-types-config'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.attend') && !canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.attend'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await ctx.params
  try {
    const att = await prisma.sellerQueueAttendance.findUnique({ where: { id }, select: { id: true, tenantId: true, unitId: true, queueId: true, sellerId: true, status: true, notes: true } })
    if (!att) return NextResponse.json({ success: false, error: 'Atendimento não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, att.tenantId)) return forbiddenResponse('Atendimento de outra loja.')
    // Próprio vendedor ou gestão.
    const isManager = canAccessModule(user.role, 'sellerQueue.manage')
    if (att.sellerId !== user.id && !isManager) return forbiddenResponse('Só o vendedor do atendimento ou a gestão pode definir o tipo.')
    if (['FINISHED', 'REJECTED', 'EXPIRED'].includes(att.status)) return NextResponse.json({ success: false, error: 'Atendimento encerrado.' }, { status: 409 })

    const body = await req.json().catch(() => ({})) as { visitType?: string; description?: string; customerId?: string | null }
    const cfg = await getUnitConfig(tenantId, att.unitId)
    const typesCfg = readAttendanceTypesConfig(cfg?.config)
    const type = findActiveType(typesCfg, body.visitType)
    if (!type) return NextResponse.json({ success: false, error: 'Tipo de atendimento inválido ou inativo.' }, { status: 400 })
    const desc = String(body.description ?? '').trim()
    if (type.requiresDescription && desc.length < 2) return NextResponse.json({ success: false, error: 'Descreva o atendimento (tipo "Outro").' }, { status: 400 })

    const data: Record<string, unknown> = { visitType: type.code }
    if (desc) data.notes = att.notes ? `${att.notes}\n${desc}`.slice(0, 2000) : desc
    if (typeof body.customerId === 'string' && body.customerId) data.customerId = body.customerId
    await prisma.sellerQueueAttendance.update({ where: { id: att.id }, data })

    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'ATTENDANCE_STARTED', sellerId: att.sellerId, actorId: user.id, attendanceId: att.id, reason: `tipo: ${type.label}` }).catch(() => {})
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role, afterData: { visitType: type.code } as never })
    return NextResponse.json({ success: true, data: { visitType: type.code, consumesTurn: type.consumesTurn } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
