// =============================================================================
// /api/negotiations/[id]/return — Retorno financeiro da negociação
//   GET : valores atuais do retorno
//   PUT : vendedor informa returnRatePercent (0–6); ILA/IOF só com permissão
//         'negotiations.financing'. Recalcula bruto/ILA/IOF/líquido e comissões.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule, canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createDealAudit } from '@/lib/negotiation-service'
import { recalculateNegotiationCommissions } from '@/lib/commission-generator'
import { calculateReturn } from '@/lib/finance/return-calc'
import { returnRateSchema, returnFinancingSchema } from '@/lib/validators/return'

type Ctx = { params: Promise<{ id: string }> }

function toNum(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params

  try {
    const deal = await prisma.deal.findUnique({
      where: { id },
      select: {
        tenantId: true, financedAmount: true, paymentBank: true,
        returnRatePercent: true, returnGrossValue: true, ilaPercent: true, ilaValue: true,
        iofPercent: true, iofValue: true, returnNetValue: true, returnCommissionStatus: true,
      },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }
    return NextResponse.json({
      success: true,
      data: deal,
      canEditFinancing: canAccessModule(session.user.role, 'negotiations.financing'),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const { id } = await params

  try {
    const raw = await req.json()
    const { returnRatePercent } = returnRateSchema.parse(raw)

    const deal = await prisma.deal.findUnique({
      where: { id },
      select: { id: true, tenantId: true, unitId: true, financedAmount: true, ilaPercent: true, iofPercent: true, returnRatePercent: true },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // ILA/IOF: somente perfis autorizados podem alterar; demais mantêm o atual.
    const canFinancing = canAccessModule(session.user.role, 'negotiations.financing')
    let ilaPercent = toNum(deal.ilaPercent)
    let iofPercent = toNum(deal.iofPercent)
    if (canFinancing) {
      const fin = returnFinancingSchema.parse(raw)
      if (fin.ilaPercent != null) ilaPercent = fin.ilaPercent
      if (fin.iofPercent != null) iofPercent = fin.iofPercent
    }

    const calc = calculateReturn({
      financedAmount: deal.financedAmount,
      returnRatePercent,
      ilaPercent,
      iofPercent,
    })

    await prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id },
        data: {
          returnRatePercent,
          returnGrossValue: calc.returnGrossValue,
          ilaPercent,
          ilaValue:         calc.ilaValue,
          iofPercent,
          iofValue:         calc.iofValue,
          returnNetValue:   calc.returnNetValue,
        },
      })
      await createDealAudit(tx as never, {
        dealId:   id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'ATUALIZAR_RETORNO',
        field:    'returnRatePercent',
        oldValue: toNum(deal.returnRatePercent),
        newValue: returnRatePercent,
        reason:   `Retorno ${returnRatePercent}% — líquido R$ ${calc.returnNetValue.toFixed(2)}`,
      })
    })

    await recalculateNegotiationCommissions({
      dealId:      id,
      tenantId:    deal.tenantId,
      triggeredBy: session.user.id,
    }).catch(() => {})

    return NextResponse.json({ success: true, data: { returnRatePercent, ...calc } })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos.' }, { status: 400 })
    }
    return handlePrismaError(err)
  }
}
