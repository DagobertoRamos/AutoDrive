// =============================================================================
// /api/negotiations/[id]/return — Retorno financeiro da negociação
//   GET : valores atuais do retorno
//   PUT : vendedor informa returnRatePercent; ILA/IOF vêm da configuração do tenant
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
import { syncTenantFinance } from '@/lib/finance/finance-sync'
import { calculateReturn, validateReturnPercent } from '@/lib/finance/return-calc'
import { returnRateSchema } from '@/lib/validators/return'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { resolveReturnSettingsForDate } from '@/lib/finance/return-settings'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

type Ctx = { params: Promise<{ id: string }> }

function toNum(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

function returnCompetenceDate(deal: {
  saleDate?: Date | null
  approvedAt?: Date | null
  finalizedAt?: Date | null
  createdAt?: Date | null
  financeProposals?: Array<{ updatedAt?: Date | null; createdAt?: Date | null }> | null
}) {
  const financeDate = deal.financeProposals?.[0]?.updatedAt ?? deal.financeProposals?.[0]?.createdAt ?? null
  return deal.approvedAt ?? financeDate ?? deal.saleDate ?? deal.finalizedAt ?? deal.createdAt ?? new Date()
}

function dateOnlyToDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params

  try {
    const deal = await prisma.deal.findFirst({
      where: await buildNegotiationAccessWhere(session.user, { id }),
      select: {
        tenantId: true, financedAmount: true, paymentBank: true, saleDate: true, approvedAt: true, finalizedAt: true, createdAt: true,
        returnRatePercent: true, returnGrossValue: true, ilaPercent: true, ilaValue: true,
        iofPercent: true, iofValue: true, returnNetValue: true, returnCommissionStatus: true,
        financeProposals: { orderBy: { updatedAt: 'desc' }, take: 1, select: { id: true, updatedAt: true, createdAt: true } },
      },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
    const returnConfig = deal.tenantId
      ? await resolveReturnSettingsForDate(deal.tenantId, returnCompetenceDate(deal)).catch(() => null)
      : null
    return NextResponse.json({
      success: true,
      data: deal,
      returnConfig,
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
    { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const { id } = await params

  try {
    const raw = await req.json()
    const { returnRatePercent } = returnRateSchema.parse(raw)

    const deal = await prisma.deal.findFirst({
      where: await buildNegotiationAccessWhere(session.user, { id }),
      select: {
        id: true, tenantId: true, unitId: true, financedAmount: true, returnRatePercent: true,
        saleDate: true, approvedAt: true, finalizedAt: true, createdAt: true,
        financeProposals: { orderBy: { updatedAt: 'desc' }, take: 1, select: { id: true, updatedAt: true, createdAt: true } },
      },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    if (!deal.tenantId) {
      return NextResponse.json({ error: 'Negociação sem tenant não pode calcular retorno definitivo.' }, { status: 400 })
    }
    const baseAmount = toNum(deal.financedAmount)
    if (baseAmount <= 0) {
      return NextResponse.json({ error: 'Informe o valor financiado antes de calcular o retorno.' }, { status: 400 })
    }

    const operationDate = returnCompetenceDate(deal)
    const resolved = await resolveReturnSettingsForDate(deal.tenantId, operationDate)
    if (!resolved.range.active) {
      return NextResponse.json({ error: 'Configuração de retorno/F&I está inativa para este tenant.' }, { status: 400 })
    }
    const range = validateReturnPercent(returnRatePercent, resolved.range.minReturnPercent, resolved.range.maxReturnPercent)
    if (!range.ok) {
      return NextResponse.json({ error: range.message }, { status: 400 })
    }
    if (!resolved.ila && !resolved.range.allowMissingIlaAsZero) {
      return NextResponse.json({ error: `ILA não cadastrado para a competência ${resolved.competence.label}.` }, { status: 400 })
    }
    if (!resolved.iof && !resolved.range.allowMissingIofAsZero) {
      return NextResponse.json({ error: 'IOF não cadastrado para a data/competência da operação.' }, { status: 400 })
    }
    const ila = resolved.ila ?? {
      id: 'ILA_ZERO_NAO_CADASTRADO',
      month: resolved.competence.month,
      year: resolved.competence.year,
      value: 0,
      valueType: 'PERCENTUAL' as const,
      active: true,
      notes: 'Calculado com ILA zerado por configuração avançada.',
    }
    const iof = resolved.iof ?? {
      id: 'IOF_ZERO_NAO_CADASTRADO',
      name: 'IOF zerado por configuração',
      month: null,
      year: null,
      startsAt: null,
      endsAt: null,
      value: 0,
      valueType: 'PERCENTUAL' as const,
      active: true,
      notes: 'Calculado com IOF zerado por configuração avançada.',
    }

    const calc = calculateReturn({
      financedAmount: baseAmount,
      returnRatePercent,
      ilaPercent: 0,
      iofPercent: 0,
      ilaType: ila.valueType,
      ilaValue: ila.value,
      iofType: iof.valueType,
      iofValue: iof.value,
      deductionBase: resolved.range.deductionBase,
      minReturnPercent: resolved.range.minReturnPercent,
      maxReturnPercent: resolved.range.maxReturnPercent,
    })
    const calculatedAt = new Date()
    const financingId = deal.financeProposals?.[0]?.id ?? null
    const snapshot = {
      tenantId: deal.tenantId,
      negotiationId: id,
      financingId,
      baseAmount,
      calculationBase: resolved.range.calculationBase,
      deductionBase: resolved.range.deductionBase,
      returnPercent: returnRatePercent,
      returnMinPercent: resolved.range.minReturnPercent,
      returnMaxPercent: resolved.range.maxReturnPercent,
      grossReturnAmount: calc.returnGrossValue,
      ila: {
        settingId: ila.id,
        competenceMonth: resolved.competence.month,
        competenceYear: resolved.competence.year,
        competence: resolved.competence.label,
        value: ila.value,
        valueType: ila.valueType,
        amount: calc.ilaValue,
      },
      iof: {
        settingId: iof.id,
        name: iof.name ?? null,
        startsAt: iof.startsAt ?? null,
        endsAt: iof.endsAt ?? null,
        value: iof.value,
        valueType: iof.valueType,
        amount: calc.iofValue,
      },
      netReturnAmount: calc.returnNetValue,
      commissionBaseAmount: calc.commissionBaseValue,
      range: {
        minReturnPercent: resolved.range.minReturnPercent,
        maxReturnPercent: resolved.range.maxReturnPercent,
      },
      calculatedBy: session.user.id,
      calculatedAt: calculatedAt.toISOString(),
      operationDate: operationDate.toISOString(),
      settingsVersion: calculatedAt.toISOString(),
      status: 'CALCULADO',
    }

    await prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id },
        data: {
          returnRatePercent,
          returnGrossValue: calc.returnGrossValue,
          ilaPercent: ila.valueType === 'PERCENTUAL' ? ila.value : null,
          ilaValue:         calc.ilaValue,
          iofPercent: iof.valueType === 'PERCENTUAL' ? iof.value : null,
          iofValue:         calc.iofValue,
          returnNetValue:   calc.returnNetValue,
        },
      })
      await tx.returnCalculationSnapshot.create({
        data: {
          tenantId: deal.tenantId,
          negotiationId: id,
          financingId,
          baseAmount,
          returnPercent: returnRatePercent,
          returnMinPercent: resolved.range.minReturnPercent,
          returnMaxPercent: resolved.range.maxReturnPercent,
          grossReturnAmount: calc.returnGrossValue,
          ilaSettingId: resolved.ila?.id ?? null,
          ilaCompetenceMonth: resolved.competence.month,
          ilaCompetenceYear: resolved.competence.year,
          ilaPercent: ila.valueType === 'PERCENTUAL' ? ila.value : null,
          ilaDiscountAmount: calc.ilaValue,
          iofRuleId: resolved.iof?.id ?? null,
          iofStartDate: dateOnlyToDate(iof.startsAt),
          iofEndDate: dateOnlyToDate(iof.endsAt),
          iofPercent: iof.valueType === 'PERCENTUAL' ? iof.value : null,
          iofDiscountAmount: calc.iofValue,
          netReturnAmount: calc.returnNetValue,
          commissionBaseAmount: calc.commissionBaseValue,
          operationDate,
          status: 'CALCULADO',
          calculatedBy: session.user.id,
          calculatedAt,
          settingsVersion: calculatedAt.toISOString(),
          snapshotJson: snapshot,
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
        metadata: snapshot,
      })
    })

    await recalculateNegotiationCommissions({
      dealId:      id,
      tenantId:    deal.tenantId,
      triggeredBy: session.user.id,
    }).catch(() => {})
    await syncTenantFinance(deal.tenantId ?? null).catch(() => {})

    return NextResponse.json({ success: true, data: { returnRatePercent, ...calc, snapshot } })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos.' }, { status: 400 })
    }
    return handlePrismaError(err)
  }
}
