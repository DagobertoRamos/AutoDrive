// =============================================================================
// /api/negotiations/[id]/payments/[paymentId] — atualizar/remover pagamento
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { isDealLocked, canAddPayment } from '@/lib/negotiation-rbac'
import { createSafeAuditLog } from '@/lib/auth-guards'

export const dynamic = 'force-dynamic'

async function loadContext(id: string, paymentId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id },
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

  const ctx = await loadContext(params.id, params.paymentId)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { deal } = ctx
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
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

  try {
    const updated = await prisma.dealPayment.update({ where: { id: params.paymentId }, data })
    await createSafeAuditLog({
      userId: session.user.id, tenantId: session.user.tenantId ?? null,
      action: 'UPDATE_PAYMENT', entity: 'DealPayment', entityId: params.paymentId,
      userName: session.user.name, userRole: session.user.role,
    })
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

  const ctx = await loadContext(params.id, params.paymentId)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { deal } = ctx
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  if (isDealLocked(deal.status)) {
    return NextResponse.json({ error: 'Negociação finalizada. Reabra para alterar.' }, { status: 423 })
  }
  const actor = await getActor(session)
  if (!canAddPayment(actor, deal)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    await prisma.dealPayment.delete({ where: { id: params.paymentId } })
    await createSafeAuditLog({
      userId: session.user.id, tenantId: session.user.tenantId ?? null,
      action: 'DELETE_PAYMENT', entity: 'DealPayment', entityId: params.paymentId,
      userName: session.user.name, userRole: session.user.role,
    })
    return NextResponse.json({ ok: true })
  } catch (err) { return handlePrismaError(err) }
}
