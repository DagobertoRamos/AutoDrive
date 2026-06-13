// =============================================================================
// POST /api/negotiations/[id]/signal — Registrar sinal/entrada recebida
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'

const SIGNAL_ALLOWED_STATUSES = new Set([
  'APROVADA', 'LIBERADA', 'AGUARDANDO_SINAL', 'EM_ANDAMENTO', 'RESERVADA',
])

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const body   = await req.json().catch(() => ({}))
    const amount = Number(body?.amount ?? 0)
    const notes  = body?.notes as string | undefined

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valor do sinal deve ser maior que zero.' }, { status: 400 })
    }

    const deal = await prisma.deal.findUnique({ where: { id: params.id } })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    if (!SIGNAL_ALLOWED_STATUSES.has(deal.status)) {
      return NextResponse.json(
        { error: 'Sinal só pode ser registrado em negociações aprovadas ou aguardando sinal.' },
        { status: 409 },
      )
    }

    const prevStatus = deal.status
    const newStatus  = prevStatus === 'AGUARDANDO_SINAL' ? 'SINAL_RECEBIDO' : prevStatus

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data: {
          signalAmount:  amount,
          status:        newStatus,
          totalPayments: (Number(deal.totalPayments ?? 0)) + amount,
        } as object,
      })

      // Registra forma de pagamento
      await tx.dealPayment.create({
        data: {
          dealId: params.id,
          type:   'ENTRADA',
          value:  amount,
          notes:  notes ?? 'Sinal registrado',
        },
      })

      if (prevStatus !== newStatus) {
        await tx.dealStatusHistory.create({
          data: {
            dealId:          params.id,
            previousStatus:  prevStatus,
            newStatus,
            changedByUserId: session.user.id,
            reason:          `Sinal de R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} registrado`,
          },
        })
      }

      await tx.auditLog.create({
        data: {
          userId:   session.user.id,
          tenantId: session.user.tenantId ?? null,
          action:   'SIGNAL',
          entity:   'Deal',
          entityId: params.id,
          userName: session.user.name,
          userRole: session.user.role,
          status:   'SUCCESS',
          afterData: { amount, notes } as never,
        },
      })

      return d
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
