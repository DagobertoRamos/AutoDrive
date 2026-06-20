// =============================================================================
// PATCH /api/negotiations/[id]/discount-requests/[requestId]/cancel
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canApproveDiscount } from '@/lib/negotiation-rbac'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function PATCH(
  _req: NextRequest,
  ctxArg: { params: { id: string; requestId: string } | Promise<{ id: string; requestId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const reqDisc = await prisma.dealDiscountRequest.findUnique({
    where: { id: params.requestId },
    include: { deal: { select: { id: true, tenantId: true, status: true, sellerId: true } } },
  })
  if (!reqDisc || reqDisc.dealId !== params.id) {
    return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
  }
  if (session.user.tenantId && reqDisc.deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  if (reqDisc.status !== 'PENDENTE') {
    return NextResponse.json({ error: 'Apenas pendentes podem ser canceladas' }, { status: 409 })
  }

  const actor = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
  const isRequester = reqDisc.requestedById === session.user.id
  if (!isRequester && !canApproveDiscount(actor, reqDisc.deal)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const updated = await prisma.dealDiscountRequest.update({
      where: { id: params.requestId },
      data: {
        status:      'CANCELADO',
        decidedById: session.user.id,
        decidedAt:   new Date(),
      },
    })
    await createSafeAuditLog({
      userId: session.user.id!, tenantId: session.user.tenantId ?? null,
      action: 'CANCEL_DISCOUNT', entity: 'DealDiscountRequest', entityId: params.requestId,
      userName: session.user.name, userRole: session.user.role,
    })
    return NextResponse.json({ data: updated })
  } catch (err) { return handlePrismaError(err) }
}
