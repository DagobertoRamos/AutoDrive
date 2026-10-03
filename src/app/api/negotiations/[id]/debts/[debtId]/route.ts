// =============================================================================
// /api/negotiations/[id]/debts/[debtId] — Editar e remover débito
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { canEditDeal }          from '@/lib/negotiation-rbac'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere, getNegotiationActorIds } from '@/lib/negotiation-access'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { debtRowLabel, logDealChild, payLabel, statusPt } from '@/lib/negotiation/children-sync'

async function getDealAndCheck(dealId: string, session: NonNullable<Awaited<ReturnType<typeof getServerAuthSession>>>) {
  const deal = await prisma.deal.findFirst({
    where:  await buildNegotiationAccessWhere(session.user, { id: dealId }),
    select: { id: true, tenantId: true, status: true, sellerId: true },
  })
  if (!deal) return { deal: null, err: NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 }) }
  const actorIds = await getNegotiationActorIds(session.user)
  const actor = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId ?? null, sellerId: actorIds.sellerId }
  if (!canEditDeal(actor, deal)) {
    return { deal: null, err: NextResponse.json({ error: 'Negociação não pode ser editada neste status.' }, { status: 409 }) }
  }
  return { deal, err: null }
}

// ── PATCH — Editar débito ─────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string; debtId: string } | Promise<{ id: string; debtId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const { deal, err } = await getDealAndCheck(params.id, session)
  if (err) return err

  try {
    const body = await req.json()
    const { vehicleRole, type, description, value, responsavel, notes, dueDate } = body

    const beforeDebt = await prisma.dealDebt.findUnique({ where: { id: params.debtId } })
    const updated = await (prisma.dealDebt as any).update({
      where: { id: params.debtId },
      data: {
        ...(vehicleRole !== undefined && { vehicleRole }),
        ...(type        !== undefined && { type        }),
        ...(description !== undefined && { description }),
        ...(value       !== undefined && { value: Number(value) }),
        ...(responsavel !== undefined && { responsavel }),
        ...(notes       !== undefined && { notes       }),
        ...(dueDate     !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      },
    })

    void deal // used for check above

    if (beforeDebt && debtRowLabel(beforeDebt) !== debtRowLabel(updated)) await logDealChild(params.id, { id: session.user.id, name: session.user.name, role: session.user.role }, 'débito', debtRowLabel(beforeDebt), debtRowLabel(updated))
    await syncDealFinanceSafe(params.id)
    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── DELETE — Remover débito ───────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  ctxArg: { params: { id: string; debtId: string } | Promise<{ id: string; debtId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const { deal, err } = await getDealAndCheck(params.id, session)
  if (err) return err

  try {
    const gone = await prisma.dealDebt.findUnique({ where: { id: params.debtId } })
    await (prisma.dealDebt as any).delete({ where: { id: params.debtId } })
    if (gone) await logDealChild(params.id, { id: session.user.id, name: session.user.name, role: session.user.role }, 'débito', debtRowLabel(gone), 'Removido')
    void deal // used for check above

    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId: session.user.tenantId ?? null,
        action:   'DELETE',
        entity:   'DealDebt',
        entityId: params.debtId,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
        afterData: { dealId: params.id } as never,
      },
    }).catch(() => {})

    await syncDealFinanceSafe(params.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
