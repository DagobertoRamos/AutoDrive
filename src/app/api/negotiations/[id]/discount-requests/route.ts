// =============================================================================
// /api/negotiations/[id]/discount-requests — listar e solicitar desconto
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { isDealLocked, canRequestDiscount } from '@/lib/negotiation-rbac'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

export const dynamic = 'force-dynamic'

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

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: params.id }),
    select: { tenantId: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  const requests = await prisma.dealDiscountRequest.findMany({
    where: { dealId: params.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ data: requests })
}

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
    select: { id: true, tenantId: true, status: true, sellerId: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  if (isDealLocked(deal.status)) {
    return NextResponse.json({ error: 'Negociação finalizada. Reabra para alterar.' }, { status: 423 })
  }

  const actor = await getActor(session)
  if (!canRequestDiscount(actor, deal)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }) }

  const requestedValue = Number(body?.requestedValue)
  const reason = String(body?.reason ?? '').trim()
  if (!Number.isFinite(requestedValue) || requestedValue <= 0) {
    return NextResponse.json({ error: 'Valor solicitado inválido' }, { status: 400 })
  }
  if (reason.length < 5) {
    return NextResponse.json({ error: 'Motivo é obrigatório' }, { status: 400 })
  }

  try {
    const created = await prisma.dealDiscountRequest.create({
      data: {
        dealId:         params.id,
        tenantId:       deal.tenantId,
        requestedById:  session.user.id!,
        requestedValue: requestedValue as any,
        reason,
        status:         'PENDENTE', // backend força — vendedor não pode passar outro
      },
    })
    await createSafeAuditLog({
      userId: session.user.id!, tenantId: session.user.tenantId ?? null,
      action: 'REQUEST_DISCOUNT', entity: 'DealDiscountRequest', entityId: created.id,
      userName: session.user.name, userRole: session.user.role,
    })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
