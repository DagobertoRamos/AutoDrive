// =============================================================================
// /api/negotiations/[id]/payments/[paymentId] — atualizar/remover pagamento
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule, requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { isDealLocked, canAddPayment } from '@/lib/negotiation-rbac'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { debtRowLabel, logDealChild, payLabel, statusPt } from '@/lib/negotiation/children-sync'

export const dynamic = 'force-dynamic'

async function loadContext(id: string, paymentId: string, user: NonNullable<Awaited<ReturnType<typeof getServerAuthSession>>>['user']) {
  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(user, { id }),
    select: { id: true, tenantId: true, status: true, sellerId: true },
  })
  if (!deal) return { error: 'Negociação não encontrada', status: 404 as const }
  const payment = await prisma.dealPayment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.dealId !== id) {
    return { error: 'Pagamento não encontrado', status: 404 as const }
  }
  return { deal, payment }
}

async function getActor(session: any) {
  const seller = session?.user?.id
    ? await prisma.seller.findFirst({ where: { userId: session.user.id }, select: { id: true } })
    : null
  return {
    id:       session?.user?.id,
    role:     session?.user?.role as string,
    tenantId: session?.user?.tenantId as string | null,
    sellerId: seller?.id ?? null,
  }
}

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string; paymentId: string } | Promise<{ id: string; paymentId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const ctx = await loadContext(params.id, params.paymentId, session.user)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { deal } = ctx
  if (isDealLocked(deal.status)) {
    return NextResponse.json({ error: 'Negociação finalizada. Reabra para alterar.' }, { status: 423 })
  }
  const actor = await getActor(session)
  if (!canAddPayment(actor, deal)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }) }

  const data: any = {}
  if (body?.method || body?.type) data.type = String(body.method ?? body.type).toUpperCase()
  if (body?.amount != null || body?.value != null) {
    const amt = Number(body.amount ?? body.value)
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
    data.value = amt
  }
  if (body?.bank !== undefined) data.bank = body.bank
  if (body?.cardBrand !== undefined) data.cardBrand = body.cardBrand
  if (body?.installments !== undefined) data.installments = body.installments == null ? null : Number(body.installments)
  if (body?.firstDueDate !== undefined) data.firstDueDate = body.firstDueDate ? new Date(body.firstDueDate) : null
  if (body?.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body?.notes !== undefined) data.notes = body.notes
  if (body?.signalMethod !== undefined) data.method = body.signalMethod ? String(body.signalMethod).toUpperCase().slice(0, 30) : null
  if (body?.authorizationCode !== undefined) data.authorizationCode = body.authorizationCode ? String(body.authorizationCode).trim().slice(0, 40) : null
  if (body?.paidAt !== undefined) data.paidAt = body.paidAt ? new Date(body.paidAt) : null
  // Status (confirmar/cancelar) só pelo financeiro.
  if (body?.status !== undefined) {
    if (!canAccessModule(session.user.role, 'finance.manage')) return NextResponse.json({ error: 'Só o financeiro confirma ou cancela pagamentos (Financeiro › Recebimentos).' }, { status: 403 })
    const st = String(body.status).toUpperCase()
    if (!['PENDENTE', 'CONFIRMADO', 'CANCELADO'].includes(st)) return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    data.status = st
    if (st === 'CONFIRMADO' && body?.paidAt === undefined) data.paidAt = new Date()
  }

  try {
    const before = ctx.payment
    const updated = await prisma.dealPayment.update({ where: { id: params.paymentId }, data })
    const changed = payLabel(before) !== payLabel(updated) || before.status !== updated.status
    if (changed) await logDealChild(params.id, { id: session.user.id, name: session.user.name, role: session.user.role }, 'pagamento', `${payLabel(before)} (${statusPt(before.status)})`, `${payLabel(updated)} (${statusPt(updated.status)})`)
    await createSafeAuditLog({
      userId: session.user.id, tenantId: session.user.tenantId ?? null,
      action: 'UPDATE_PAYMENT', entity: 'DealPayment', entityId: params.paymentId,
      userName: session.user.name, userRole: session.user.role,
    })
    await syncDealFinanceSafe(params.id)
    return NextResponse.json({ data: updated })
  } catch (err) { return handlePrismaError(err) }
}

export async function DELETE(
  _req: NextRequest,
  ctxArg: { params: { id: string; paymentId: string } | Promise<{ id: string; paymentId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const ctx = await loadContext(params.id, params.paymentId, session.user)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { deal } = ctx
  if (isDealLocked(deal.status)) {
    return NextResponse.json({ error: 'Negociação finalizada. Reabra para alterar.' }, { status: 423 })
  }
  const actor = await getActor(session)
  if (!canAddPayment(actor, deal)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  if (ctx.payment.status === 'CONFIRMADO') {
    return NextResponse.json({ error: 'Pagamento confirmado pelo financeiro não pode ser excluído.' }, { status: 409 })
  }

  try {
    await prisma.dealPayment.delete({ where: { id: params.paymentId } })
    await logDealChild(params.id, { id: session.user.id, name: session.user.name, role: session.user.role }, 'pagamento', payLabel(ctx.payment), 'Removido')
    await createSafeAuditLog({
      userId: session.user.id, tenantId: session.user.tenantId ?? null,
      action: 'DELETE_PAYMENT', entity: 'DealPayment', entityId: params.paymentId,
      userName: session.user.name, userRole: session.user.role,
    })
    await syncDealFinanceSafe(params.id)
    return NextResponse.json({ ok: true })
  } catch (err) { return handlePrismaError(err) }
}
