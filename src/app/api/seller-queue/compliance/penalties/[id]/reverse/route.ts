// =============================================================================
// POST /api/seller-queue/compliance/penalties/[id]/reverse — Estorno de penalidade.
// Cria penalidade de estorno (+pontos) e marca a original como inativa.
// Body: { reason }. Gate: sellerQueue.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const penalty = await prisma.sellerQueuePenalty.findFirst({ where: { id, tenantId } })
    if (!penalty) return NextResponse.json({ success: false, error: 'Penalidade não encontrada.' }, { status: 404 })
    if (!penalty.active && penalty.points >= 0) return NextResponse.json({ success: false, error: 'Penalidade já inativa.' }, { status: 409 })

    const b = await req.json().catch(() => ({}))
    const reason = String(b?.reason ?? '').trim()
    if (!reason) return NextResponse.json({ success: false, error: 'Informe o motivo do estorno.' }, { status: 400 })

    // Inativa a original + cria estorno negativo (pontos serão subtraídos do total).
    await prisma.$transaction([
      prisma.sellerQueuePenalty.update({ where: { id }, data: { active: false } }),
      prisma.sellerQueuePenalty.create({ data: { tenantId, unitId: penalty.unitId, sellerId: penalty.sellerId, type: 'REVERSAL', reason: `[ESTORNO] ${reason}`, points: -(penalty.points), active: false, appliedById: user.id } }),
    ])

    await prisma.notification.create({ data: { userId: penalty.sellerId, tenantId, type: 'SISTEMA' as never, title: '✅ Penalidade estornada', message: `${penalty.points} ponto(s) estornado(s). Motivo: ${reason}`, actionUrl: '/vendedor-da-vez/conformidade' } }).catch(() => {})
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'COMPLIANCE_REVERSAL', entity: 'SellerQueuePenalty', entityId: id, userName: user.name, userRole: user.role, afterData: { reason, reversedPoints: penalty.points } })

    return NextResponse.json({ success: true })
  } catch (err) { return NextResponse.json({ success: false, error: 'Erro ao estornar.' }, { status: 500 }) }
}
