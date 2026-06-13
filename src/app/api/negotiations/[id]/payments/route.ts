// =============================================================================
// /api/negotiations/[id]/payments — listar e criar pagamentos
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { isDealLocked, canAddPayment } from '@/lib/negotiation-rbac'
import { createSafeAuditLog } from '@/lib/auth-guards'

export const dynamic = 'force-dynamic'

const PAYMENT_METHODS = new Set([
  'DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO',
  'FINANCIAMENTO', 'BOLETO', 'TRANSFERENCIA', 'SINAL', 'DUPLICATA', 'OUTROS',
])

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

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const payments = await prisma.dealPayment.findMany({
    where:   { dealId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ data: payments })
}

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

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
    return NextResponse.json({ error: 'Sem permissão para adicionar pagamento' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }) }

  const method = String(body?.method ?? body?.type ?? '').toUpperCase()
  if (!PAYMENT_METHODS.has(method)) {
    return NextResponse.json({ error: 'Forma de pagamento inválida' }, { status: 400 })
  }
  const amount = Number(body?.amount ?? body?.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
  }

  try {
    // Sanitiza retorno % pra 0..6 com 2 casas
    let returnPct: number | null = null
    if (body?.returnPct != null && body.returnPct !== '') {
      const n = Number(body.returnPct)
      if (Number.isFinite(n)) returnPct = Math.min(6, Math.max(0, Math.round(n * 100) / 100))
    }
    // Vendedor não pode setar status diferente de PENDENTE
    const isVendedor = ['VENDEDOR', 'VENDEDOR_LIDER'].includes(session.user.role)
    const rawStatus  = typeof body?.status === 'string' ? body.status.toUpperCase() : null
    const status     = isVendedor
      ? 'PENDENTE'
      : (['PENDENTE', 'CONFIRMADO', 'CANCELADO'].includes(rawStatus ?? '') ? rawStatus : 'PENDENTE')

    // Cast `as any` no data inteiro porque alguns campos novos (status,
    // pixKey, agency, account, installmentValue, installmentIntervalDays,
    // returnPct, vehiclePlate, paidAt) podem ainda não estar no client TS
    // gerado se o dev server estiver segurando a DLL durante o desenvolvimento.
    // As colunas já existem no banco (ALTER TABLE deal_payments aplicado).
    const created = await prisma.dealPayment.create({
      data: {
        dealId:       params.id,
        tenantId:     deal.tenantId,
        type:         method,
        status,
        value:        amount as any,
        bank:         body?.bank ?? null,
        cardBrand:    body?.cardBrand ?? null,
        pixKey:       body?.pixKey ?? null,
        agency:       body?.agency ?? null,
        account:      body?.account ?? null,
        installments: body?.installments != null ? Number(body.installments) : null,
        installmentValue:        body?.installmentValue != null ? (Number(body.installmentValue) as any) : null,
        installmentIntervalDays: body?.installmentIntervalDays != null ? Number(body.installmentIntervalDays) : null,
        returnPct:    returnPct as any,
        vehiclePlate: body?.vehiclePlate ?? null,
        firstDueDate: body?.firstDueDate ? new Date(body.firstDueDate) : null,
        dueDate:      body?.dueDate ? new Date(body.dueDate) : null,
        paidAt:       body?.paidAt ? new Date(body.paidAt) : null,
        notes:        body?.notes ?? null,
        createdById:  session.user.id,
      } as any,
    })

    await createSafeAuditLog({
      userId:   session.user.id,
      tenantId: session.user.tenantId ?? null,
      action:   'CREATE_PAYMENT',
      entity:   'DealPayment',
      entityId: created.id,
      userName: session.user.name,
      userRole: session.user.role,
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
