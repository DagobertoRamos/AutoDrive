// =============================================================================
// /api/negotiations/[id]/debts — Listar e criar débitos de uma negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { canEditDeal }          from '@/lib/negotiation-rbac'

// ── GET — Listar débitos ──────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const deal = await prisma.deal.findUnique({
      where:  { id: params.id },
      select: { id: true, tenantId: true },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const debts = await (prisma.dealDebt as any).findMany({
      where:   { dealId: params.id },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ data: debts })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar débito ───────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const deal = await prisma.deal.findUnique({
      where:  { id: params.id },
      select: { id: true, tenantId: true, status: true, sellerId: true },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const actor = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId ?? null, sellerId: null }
    if (!canEditDeal(actor, deal)) {
      return NextResponse.json({ error: 'Negociação não pode ser editada neste status.' }, { status: 409 })
    }

    const body = await req.json()
    const { vehicleRole, type, description, value, responsavel, notes, dueDate } = body

    if (!type || !value) {
      return NextResponse.json({ error: 'Tipo e valor são obrigatórios.' }, { status: 400 })
    }

    const debt = await (prisma.dealDebt as any).create({
      data: {
        dealId:      params.id,
        vehicleRole: vehicleRole ?? null,
        type:        type,
        description: description ?? null,
        value:       Number(value),
        responsavel: responsavel ?? 'LOJA',
        notes:       notes       ?? null,
        dueDate:     dueDate     ? new Date(dueDate) : null,
      },
    })

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId: session.user.tenantId ?? null,
        action:   'CREATE',
        entity:   'DealDebt',
        entityId: debt.id,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
        afterData: { type, value, vehicleRole } as never,
      },
    }).catch(() => {})

    return NextResponse.json({ data: debt }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
