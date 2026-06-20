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

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      seller: { include: { user: { select: { role: true } } } },
    },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

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
      await tx.dealReopenLog.create({
        data: {
          dealId:         params.id,
          tenantId:       deal.tenantId,
          reopenedById:   session.user.id!,
          reason,
          previousStatus,
        },
      })
      const d = await tx.deal.update({
        where: { id: params.id },
        data:  { status: 'REABERTA' as any, finalizedAt: null },
      })
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

    return NextResponse.json({ data: updated })
  } catch (err) { return handlePrismaError(err) }
}
