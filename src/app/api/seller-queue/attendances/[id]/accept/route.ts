// =============================================================================
// POST /api/seller-queue/attendances/:id/accept — vendedor aceita o atendimento.
// Gate: sellerQueue.attend (apenas o vendedor chamado). Revalida presença,
// inicia o atendimento (IN_ATTENDANCE) e marca a chegada como ASSIGNED. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { acceptSchema } from '@/lib/validators/seller-queue'
import { getUnitConfig, toPresenceConfig, recordPresence, logQueueEvent } from '@/lib/seller-queue/queue'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const MGMT_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.attend')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.attend'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const att = await prisma.sellerQueueAttendance.findUnique({ where: { id } })
    if (!att) return NextResponse.json({ success: false, error: 'Atendimento não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, att.tenantId)) return forbiddenResponse('Atendimento de outra loja.')
    if (att.sellerId !== user.id) return forbiddenResponse('Apenas o vendedor chamado pode aceitar.')
    if (att.status !== 'CALLED') return NextResponse.json({ success: false, error: 'Este atendimento não está aguardando aceite.' }, { status: 409 })
    if (att.acceptDeadline && att.acceptDeadline.getTime() < Date.now()) {
      return NextResponse.json({ success: false, error: 'Prazo de aceite expirado.' }, { status: 409 })
    }

    const d = acceptSchema.parse(await req.json().catch(() => ({})))
    let override: { byId: string; reason: string; method: 'MANAGER_OVERRIDE' | 'LEADER_OVERRIDE' } | null = null
    if (d.override) {
      if (!canAccessModule(user.role, 'sellerQueue.override')) return forbiddenResponse('Sem permissão para liberar presença.')
      if (!d.overrideReason?.trim()) return NextResponse.json({ success: false, error: 'Justificativa obrigatória.' }, { status: 400 })
      override = { byId: user.id, reason: d.overrideReason.trim(), method: MGMT_ROLES.includes(user.role) ? 'MANAGER_OVERRIDE' : 'LEADER_OVERRIDE' }
    }

    const cfg = await getUnitConfig(tenantId, att.unitId)
    if (cfg?.requireRevalidationOnAccept !== false) {
      const presence = await recordPresence({ tenantId, unitId: att.unitId, sellerId: user.id, context: 'ACCEPT', cfg: toPresenceConfig(cfg), input: d, override })
      if (!presence.ok) return NextResponse.json({ success: false, error: presence.reason ?? 'Presença não validada.', presence }, { status: 422 })
    }

    const now = new Date()
    // FIRST-ACCEPT-WINS: quando um nível de escalonamento chama VÁRIOS colaboradores,
    // o PRIMEIRO que aceitar assume. O claim do arrival (compare-and-set) serializa
    // pela linha do arrival — o segundo recebe "já assumido". Sem duplicar atendimento.
    const claim = await prisma.$transaction(async (tx) => {
      if (att.arrivalId) {
        const arr = await tx.sellerQueueCustomerArrival.updateMany({ where: { id: att.arrivalId, status: { in: ['CALLING', 'PENDING'] } }, data: { status: 'ASSIGNED' } })
        if (arr.count !== 1) return { ok: false as const }
      }
      const self = await tx.sellerQueueAttendance.updateMany({ where: { id: att.id, status: 'CALLED' }, data: { status: 'IN_ATTENDANCE', acceptedAt: now, startedAt: now } })
      if (self.count !== 1) throw new Error('SELF_NOT_CALLED') // rollback do claim
      // Expira as chamadas irmãs (mesmo arrival) que ficaram aguardando.
      if (att.arrivalId) {
        await tx.sellerQueueAttendance.updateMany({ where: { arrivalId: att.arrivalId, id: { not: att.id }, status: 'CALLED' }, data: { status: 'EXPIRED' } })
      }
      await tx.sellerQueueEntry.updateMany({ where: { queueId: att.queueId, sellerId: user.id }, data: { status: 'IN_ATTENDANCE', lastActiveAt: now } })
      return { ok: true as const }
    }).catch((e) => { if (e instanceof Error && e.message === 'SELF_NOT_CALLED') return { ok: false as const }; throw e })

    if (!claim.ok) {
      const winner = att.arrivalId
        ? await prisma.sellerQueueAttendance.findFirst({ where: { arrivalId: att.arrivalId, status: { in: ['ACCEPTED', 'IN_ATTENDANCE'] } }, select: { sellerId: true } })
        : null
      const winnerName = winner ? (await prisma.user.findUnique({ where: { id: winner.sellerId }, select: { name: true } }))?.name : null
      return NextResponse.json({ success: false, error: winnerName ? `Este atendimento já foi assumido por ${winnerName}.` : 'Este atendimento já foi assumido por outro colaborador.' }, { status: 409 })
    }
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'ACCEPTED', sellerId: user.id, actorId: user.id, arrivalId: att.arrivalId, attendanceId: att.id })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'ATTENDANCE_STARTED', sellerId: user.id, actorId: user.id, arrivalId: att.arrivalId, attendanceId: att.id })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'ACCEPT', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
