// =============================================================================
// POST /api/negotiations/[id]/return-correction — Devolver para correção
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canReturnForCorrection } from '@/lib/negotiation-permissions'
import { createDealAudit, createStatusHistory } from '@/lib/negotiation-service'

const RETURNABLE_STATUSES = ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO']

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations.approve')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  if (!canReturnForCorrection(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para devolver para correção' }, { status: 403 })
  }

  let body: { reason?: string } = {}
  try {
    body = await req.json()
  } catch { /* ignore */ }

  if (!body.reason?.trim()) {
    return NextResponse.json({ error: 'Motivo é obrigatório ao devolver para correção' }, { status: 400 })
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  if (!RETURNABLE_STATUSES.includes(deal.status)) {
    return NextResponse.json(
      { error: 'Apenas negociações em aprovação podem ser devolvidas para correção' },
      { status: 409 },
    )
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data: { status: 'DEVOLVIDA_PARA_CORRECAO' },
      })

      await createStatusHistory(tx as unknown as any, params.id, deal.status, 'DEVOLVIDA_PARA_CORRECAO', session.user.id, body.reason)

      await createDealAudit(tx as unknown as any, {
        dealId:   params.id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'DEVOLVER_CORRECAO',
        field:    'status',
        oldValue: deal.status,
        newValue: 'DEVOLVIDA_PARA_CORRECAO',
        reason:   body.reason,
      })

      await tx.auditLog.create({
        data: {
          userId:        session.user.id,
          tenantId:      session.user.tenantId ?? null,
          action:        'RETURN_CORRECTION',
          entity:        'Deal',
          entityId:      params.id,
          userName:      session.user.name,
          userRole:      session.user.role,
          status:        'SUCCESS',
          afterData:     { status: 'DEVOLVIDA_PARA_CORRECAO' } as never,
          beforeData:    { status: deal.status } as never,
        },
      })

      return d
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
