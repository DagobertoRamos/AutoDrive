// =============================================================================
// POST /api/negotiations/[id]/submit — Enviar negociação para aprovação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { notifyDealSubmittedForApproval } from '@/services/notification.service'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

const SUBMITTABLE_STATUSES = new Set([
  'RASCUNHO',
  'EM_PREENCHIMENTO',
  'REABERTA',
  'DEVOLVIDA_PARA_CORRECAO',
])

export async function POST(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  try {
    const deal = await prisma.deal.findFirst({
      where:   await buildNegotiationAccessWhere(session.user, { id: params.id }),
      include: {
        vehicles: { take: 1, orderBy: { createdAt: 'asc' } },
        seller:   { select: { fullName: true, shortName: true } },
      },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    if (!SUBMITTABLE_STATUSES.has(deal.status)) {
      return NextResponse.json(
        { error: 'Apenas negociações em rascunho ou devolvidas podem ser enviadas para aprovação' },
        { status: 409 },
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data:  { status: 'AGUARDANDO_APROVACAO' },
      })
      await tx.dealStatusHistory.create({
        data: {
          dealId:          params.id,
          previousStatus:  deal.status,
          newStatus:       'AGUARDANDO_APROVACAO',
          changedByUserId: session.user.id,
          reason:          'Enviado para aprovação',
        },
      })
      await tx.auditLog.create({
        data: {
          userId:   session.user.id,
          tenantId: session.user.tenantId ?? null,
          action:   'SUBMIT',
          entity:   'Deal',
          entityId: params.id,
          userName: session.user.name,
          userRole: session.user.role,
          status:   'SUCCESS',
        },
      })
      return d
    })

    // ── Notifica gerente(s) responsável(eis) — best-effort ───────────────────
    try {
      const v = deal.vehicles?.[0]
      const vehicleLabel = [v?.brand, v?.model, v?.year ? `(${v.year})` : null, v?.plate ? `· placa ${v.plate}` : null]
        .filter(Boolean).join(' ').trim() || 'veículo'
      await notifyDealSubmittedForApproval({
        dealId:       params.id,
        dealNumber:   deal.dealNumber,
        tenantId:     deal.tenantId,
        vehicleLabel,
        sellerName:   deal.seller?.shortName ?? deal.seller?.fullName ?? session.user.name ?? 'Vendedor',
        managerId:    deal.managerId,
      })
    } catch (e) {
      console.error('[submit] notifyDealSubmittedForApproval failed:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
