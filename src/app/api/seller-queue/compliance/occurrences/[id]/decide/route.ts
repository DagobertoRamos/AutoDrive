// =============================================================================
// POST /api/seller-queue/compliance/occurrences/[id]/decide
// Gestão decide sobre uma ocorrência: CONFIRMED (vira penalidade) ou DISMISSED.
// Body: { decision: 'CONFIRMED'|'DISMISSED', severity?, points?, reason, note? }
// Gate: sellerQueue.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'
import { getUnitConfig } from '@/lib/seller-queue/queue'
import { readCompliancePilotConfig } from '@/lib/seller-queue/compliance'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Sem permissão para decidir ocorrências.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const flag = await prisma.sellerQueueFraudFlag.findFirst({ where: { id, tenantId } })
    if (!flag) return NextResponse.json({ success: false, error: 'Ocorrência não encontrada.' }, { status: 404 })
    if (flag.status === 'CONFIRMED') return NextResponse.json({ success: false, error: 'Ocorrência já confirmada.' }, { status: 409 })

    const b = await req.json().catch(() => ({}))
    const decision: string = b?.decision === 'CONFIRMED' ? 'CONFIRMED' : 'DISMISSED'
    const reason: string   = String(b?.reason ?? '').trim()
    if (!reason) return NextResponse.json({ success: false, error: 'Informe o motivo da decisão.' }, { status: 400 })

    const now = new Date()
    await prisma.sellerQueueFraudFlag.update({ where: { id }, data: { status: decision, reviewedById: user.id, reviewedAt: now } })

    let penaltyId: string | null = null
    if (decision === 'CONFIRMED' && flag.sellerId && flag.unitId) {
      // Lê configuração de pontos.
      const cfg = await getUnitConfig(tenantId, flag.unitId)
      const complianceCfg = readCompliancePilotConfig(cfg?.config)
      const overridePoints = typeof b?.points === 'number' ? b.points : null
      const severity = b?.severity ?? flag.severity
      let basePoints = overridePoints
      if (basePoints === null) {
        if (severity === 'HIGH')   basePoints = complianceCfg.confirmedFraudHighPoints
        else if (severity === 'LOW') basePoints = Math.max(1, Math.round(complianceCfg.confirmedFraudMediumPoints / 2))
        else                        basePoints = complianceCfg.confirmedFraudMediumPoints
      }

      // Cria penalidade confirmada.
      const penalty = await prisma.sellerQueuePenalty.create({ data: {
        tenantId, unitId: flag.unitId, sellerId: flag.sellerId,
        type: 'FRAUD_CONFIRMED', reason: reason + (b?.note ? ` — ${b.note}` : ''),
        points: basePoints, active: true, appliedById: user.id,
      }})
      penaltyId = penalty.id

      // Notifica o vendedor.
      await prisma.notification.create({ data: { userId: flag.sellerId, tenantId, type: 'PENDENCIA_CRITICA' as never, title: '⚠️ Penalidade de conformidade registrada', message: `Uma ocorrência foi confirmada: ${flag.kind}. Motivo: ${reason}. Pontos: ${basePoints}.`, actionUrl: '/vendedor-da-vez/conformidade' } }).catch(() => {})
    }

    await createSafeAuditLog({ userId: user.id, tenantId, action: `COMPLIANCE_${decision}`, entity: 'SellerQueueFraudFlag', entityId: id, userName: user.name, userRole: user.role, afterData: { decision, reason, penaltyId } })
    return NextResponse.json({ success: true, data: { decision, penaltyId } })
  } catch (err) {
    console.error('[compliance/decide]', err)
    return NextResponse.json({ success: false, error: 'Erro ao processar decisão.' }, { status: 500 })
  }
}
