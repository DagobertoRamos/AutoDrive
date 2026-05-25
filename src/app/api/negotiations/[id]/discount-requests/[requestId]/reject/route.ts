// =============================================================================
// PATCH /api/negotiations/[id]/discount-requests/[requestId]/reject
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canApproveDiscount, isDealLocked } from '@/lib/negotiation-rbac'
import { createSafeAuditLog } from '@/lib/auth-guards'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; requestId: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

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
  if (isDealLocked(reqDisc.deal.status)) {
    return NextResponse.json({ error: 'Negociação finalizada' }, { status: 423 })
  }
  if (reqDisc.status !== 'PENDENTE') {
    return NextResponse.json({ error: 'Solicitação não está pendente' }, { status: 409 })
  }
  const actor = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
  if (!canApproveDiscount(actor, reqDisc.deal)) {
    return NextResponse.json({ error: 'Apenas gerentes podem recusar descontos' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { body = {} }
  const decisionNote = String(body?.decisionNote ?? '').trim()
  if (!decisionNote) {
    return NextResponse.json({ error: 'Motivo é obrigatório' }, { status: 400 })
  }

  try {
    const updated = await prisma.dealDiscountRequest.update({
      where: { id: params.requestId },
      data: {
        status:       'RECUSADO',
        decidedById:  session.user.id,
        decidedAt:    new Date(),
        decisionNote,
      },
    })
    await createSafeAuditLog({
      userId: session.user.id!, tenantId: session.user.tenantId ?? null,
      action: 'REJECT_DISCOUNT', entity: 'DealDiscountRequest', entityId: params.requestId,
      userName: session.user.name, userRole: session.user.role,
    })
    return NextResponse.json({ data: updated })
  } catch (err) { return handlePrismaError(err) }
}
