// =============================================================================
// /api/negotiations/[id]/changes — cadastrar troco
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { isDealLocked, canAddPayment } from '@/lib/negotiation-rbac'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { assertModuleEnabled } from '@/lib/tenant-modules'

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

  const deal = await prisma.deal.findUnique({ where: { id: params.id }, select: { tenantId: true } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const changes = await prisma.dealChange.findMany({
    where: { dealId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ data: changes })
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

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true, status: true, sellerId: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
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

  const value = Number(body?.value)
  const beneficiary = String(body?.beneficiary ?? '').trim()
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
  }
  if (!beneficiary) {
    return NextResponse.json({ error: 'Favorecido é obrigatório' }, { status: 400 })
  }

  try {
    const created = await prisma.dealChange.create({
      data: {
        dealId:      params.id,
        tenantId:    deal.tenantId,
        value:       value as any,
        beneficiary,
        document:    body?.document ?? null,
        bank:        body?.bank ?? null,
        agency:      body?.agency ?? null,
        account:     body?.account ?? null,
        pixKey:      body?.pixKey ?? null,
        reason:      body?.reason ?? null,
        createdById: session.user.id,
      },
    })
    await createSafeAuditLog({
      userId: session.user.id!, tenantId: session.user.tenantId ?? null,
      action: 'CREATE_CHANGE', entity: 'DealChange', entityId: created.id,
      userName: session.user.name, userRole: session.user.role,
    })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
