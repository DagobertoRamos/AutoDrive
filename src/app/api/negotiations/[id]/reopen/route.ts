// =============================================================================
// POST /api/negotiations/[id]/reopen — reabrir negociação finalizada
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canReopen } from '@/lib/negotiation-rbac'
import { createDealAudit, createStatusHistory } from '@/lib/negotiation-service'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { revertClawbacksForDeal } from '@/lib/commission/sync'
import { syncTenantFinance } from '@/lib/finance/finance-sync'
import { publishOpsEvent } from '@/lib/automotive/events'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: params.id }),
    include: {
      seller: { include: { user: { select: { role: true } } } },
    },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  const actor = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
  if (!canReopen(actor, deal as any)) {
    return NextResponse.json({ error: 'Sem permissão para reabrir esta negociação' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { body = {} }
  const reason = String(body?.reason ?? body?.notes ?? '').trim()
  if (reason.length < 10) {
    return NextResponse.json({ error: 'O motivo deve ter ao menos 10 caracteres' }, { status: 400 })
  }

  const previousStatus = deal.status
  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Trava: dois cliques não reabrem (nem registram reabertura) duas vezes.
      const locked = await tx.deal.updateMany({ where: { id: params.id, status: previousStatus }, data: { status: 'REABERTA' as any, finalizedAt: null } })
      if (locked.count !== 1) throw new Error('DEAL_STATUS_CHANGED')
      await tx.dealReopenLog.create({
        data: {
          dealId:         params.id,
          tenantId:       deal.tenantId,
          reopenedById:   session.user.id!,
          reason,
          previousStatus,
        },
      })
      const d = await tx.deal.findUniqueOrThrow({ where: { id: params.id } })
      await createStatusHistory(tx as any, params.id, previousStatus, 'REABERTA', session.user.id!, `Reaberta: ${reason}`)
      await createDealAudit(tx as any, {
        dealId:   params.id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'REABRIR',
        field:    'status',
        oldValue: previousStatus,
        newValue: 'REABERTA',
        reason,
      })
      return d
    })

    await createSafeAuditLog({
      userId: session.user.id!, tenantId: session.user.tenantId ?? null,
      action: 'REOPEN', entity: 'Deal', entityId: params.id,
      userName: session.user.name, userRole: session.user.role,
    })

    if (previousStatus === 'CANCELADA') {
      await revertClawbacksForDeal(deal.tenantId, params.id).catch((e) => console.error('[reopen] estorno de comissão', e))
      await syncTenantFinance(deal.tenantId).catch((e) => console.error('[reopen] financeiro', e))
    }
    await syncDealFinanceSafe(params.id)
    await publishOpsEvent('deal.reopened', `${params.id}:${Date.now()}`, { dealId: params.id, actor: { id: session.user.id!, name: session.user.name ?? null, role: session.user.role } }, deal.tenantId ?? null)
    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof Error && err.message === 'DEAL_STATUS_CHANGED') return NextResponse.json({ error: 'A negociação mudou enquanto reabria. Atualize a tela.' }, { status: 409 })
    return handlePrismaError(err)
  }
}
