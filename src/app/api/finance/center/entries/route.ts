// =============================================================================
// /api/finance/center/entries — Contas a pagar / a receber (Centro Financeiro).
//   GET  : finance
//          ?type=DESPESA|RECEITA &tab=aberto|vencidos|pagos|cancelados|todos
//          &from&to (vencimento, YYYY-MM-DD) &accountId &categoryId (inclui subcategorias)
//          &costCenterId &party (fornecedor/cliente) &plate &q
//          → { data: rows, summary: { aberto, vencidos, pagos, cancelados, todos }, canManage, canPayroll }
//          Título: `amount` = saldo em aberto (PREVISTO) ou valor pago (quitado);
//            summary = titleSummary (original, settled, remaining, paidTotal, count, partial),
//            partialCount, partialBlocked (motivo de não aceitar baixa parcial).
//          Baixa parcial (filho): isPartialSettlement, partialNumber, parent { id, description }.
//          Transferências ficam de fora; folha só com finance.payroll.
//   POST : finance.manage — lançamento único ou parcelado (atômico).
//          { type, description, amount, dueDate, competenceDate?, accountId?, categoryId?,
//            costCenterId?, supplierId?, counterparty?, documentNumber?, paymentMethod?, notes?,
//            vehicleId?, employeeUserId?, dealId?, installments? (1–120), paid?: { paidDate, accountId? } }
//          dealId: vincula à negociação (source MANUAL_NEG_<uuid>); sem contraparte/veículo,
//          herda o cliente (Person ?? Customer) e o carro vendido.
//          Parcelado: N lançamentos mensais, valores iguais (centavos na última), "(k/N)",
//          mesmo installmentGroupId. `paid` baixa só a 1ª parcela.
// =============================================================================

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { periodError } from '@/lib/finance/period-lock'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { buildInstallmentPlan } from '@/lib/finance/installments-core'
import { noonUtc, todaySpYmd } from '@/lib/finance/recurrence-core'
import { spDayEnd, spDayStart } from '@/lib/dashboard/tz'
import { PARTIAL_SOURCE_SEP, partialBlockedReason, titleSummary } from '@/lib/finance/settlement-core'
import {
  MANUAL_DEAL_SOURCE_PREFIX, bad, canManage, canPayroll, categoryKindError, centerRefError, dealForEntry, isDeletableSource, payrollFilter, supplierName,
} from './_lib/shared'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const TABS = ['aberto', 'vencidos', 'pagos', 'cancelados', 'todos'] as const
type Tab = typeof TABS[number]

/** Ids da categoria e de todas as subcategorias. */
async function categoryWithChildren(tenantId: string, rootId: string): Promise<string[]> {
  const all = await prisma.financialCategory.findMany({ where: { tenantId }, select: { id: true, parentId: true } })
  const out = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const c of all) if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); grew = true }
  }
  return [...out]
}

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  try {
    const sp = new URL(req.url).searchParams
    const type = sp.get('type')
    const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as Tab) : 'aberto'
    const [payroll, manage] = await Promise.all([canPayroll(user), canManage(user)])
    const todayStart = spDayStart(todaySpYmd())

    const and: Prisma.FinancialEntryWhereInput[] = [{ tenantId, transferGroupId: null }, payrollFilter(payroll)]
    if (type === 'RECEITA' || type === 'DESPESA') and.push({ type })
    const from = sp.get('from'); const to = sp.get('to')
    if ((from && YMD.test(from)) || (to && YMD.test(to))) {
      and.push({ dueDate: { ...(from && YMD.test(from) ? { gte: spDayStart(from) } : {}), ...(to && YMD.test(to) ? { lte: spDayEnd(to) } : {}) } })
    }
    const accountId = sp.get('accountId'); if (accountId) and.push({ accountId })
    const costCenterId = sp.get('costCenterId'); if (costCenterId) and.push({ costCenterId })
    const categoryId = sp.get('categoryId')
    if (categoryId) and.push({ categoryId: { in: await categoryWithChildren(tenantId, categoryId) } })
    const party = sp.get('party')?.trim()
    if (party) {
      const sup = await prisma.supplier.findMany({ where: { tenantId, name: { contains: party, mode: 'insensitive' } }, select: { id: true }, take: 200 })
      and.push({ OR: [{ counterparty: { contains: party, mode: 'insensitive' } }, ...(sup.length ? [{ supplierId: { in: sup.map((s) => s.id) } }] : [])] })
    }
    const plate = sp.get('plate')?.replace(/[^a-z0-9]/gi, '')
    if (plate) {
      const vs = await prisma.vehicle.findMany({ where: { tenantId, plate: { contains: plate, mode: 'insensitive' } }, select: { id: true }, take: 200 })
      and.push({ vehicleId: { in: vs.map((v) => v.id) } })
    }
    const q = sp.get('q')?.trim()
    if (q) {
      const n = Number(q.replace(/\./g, '').replace(',', '.'))
      and.push({ OR: [
        { description: { contains: q, mode: 'insensitive' } }, { counterparty: { contains: q, mode: 'insensitive' } },
        { documentNumber: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } },
        ...(Number.isFinite(n) && n > 0 ? [{ amount: n }] : []),
      ] })
    }
    const base: Prisma.FinancialEntryWhereInput = { AND: and }
    const settledStatus = { in: ['PAGO', 'RECEBIDO'] as ('PAGO' | 'RECEBIDO')[] }
    const tabWhere: Record<Tab, Prisma.FinancialEntryWhereInput> = {
      aberto: { status: 'PREVISTO' },
      vencidos: { status: 'PREVISTO', dueDate: { lt: todayStart } },
      pagos: { status: settledStatus },
      cancelados: { status: 'CANCELADO' },
      todos: {},
    }
    const orderBy: Prisma.FinancialEntryOrderByWithRelationInput[] = tab === 'pagos'
      ? [{ paidDate: 'desc' }, { createdAt: 'desc' }]
      : tab === 'todos' || tab === 'cancelados' ? [{ dueDate: 'desc' }, { createdAt: 'desc' }] : [{ dueDate: 'asc' }, { createdAt: 'asc' }]

    const agg = (w: Prisma.FinancialEntryWhereInput) => prisma.financialEntry.aggregate({ where: { AND: [base, w] }, _sum: { amount: true }, _count: { _all: true } })
    const [rows, aAberto, aVenc, aPagos, aCanc, aTodos] = await Promise.all([
      prisma.financialEntry.findMany({
        where: { AND: [base, tabWhere[tab]] }, orderBy, take: 1000,
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, code: true } },
          costCenter: { select: { id: true, name: true } },
          _count: { select: { attachments: true } },
        },
      }),
      agg(tabWhere.aberto), agg(tabWhere.vencidos), agg(tabWhere.pagos), agg(tabWhere.cancelados), agg({ status: { not: 'CANCELADO' } }),
    ])
    const vehicleIds = [...new Set(rows.map((r) => r.vehicleId).filter((v): v is string => !!v))]
    const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((v): v is string => !!v))]
    const dealIds = [...new Set(rows.map((r) => r.dealId).filter((v): v is string => !!v))]
    const [vehicles, suppliers, deals] = await Promise.all([
      vehicleIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate: true, brand: true, model: true } }) : [],
      supplierIds.length ? prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } }) : [],
      dealIds.length ? prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, dealNumber: true, person: { select: { nomeCompleto: true } }, customer: { select: { name: true } } } }) : [],
    ])
    // Baixas parciais dos títulos listados e títulos das baixas parciais listadas.
    const titleIds = rows.filter((r) => !r.parentEntryId).map((r) => r.id)
    const parentIds = [...new Set(rows.map((r) => r.parentEntryId).filter((v): v is string => !!v))]
    const [partialRows, parents] = await Promise.all([
      titleIds.length ? prisma.financialEntry.findMany({ where: { parentEntryId: { in: titleIds }, status: { not: 'CANCELADO' } }, select: { parentEntryId: true, amount: true, interestAmount: true, discountAmount: true } }) : [],
      parentIds.length ? prisma.financialEntry.findMany({ where: { id: { in: parentIds } }, select: { id: true, description: true } }) : [],
    ])
    const partialsBy = new Map<string, { amount: number; interestAmount: number | null; discountAmount: number | null }[]>()
    for (const p of partialRows) {
      if (!p.parentEntryId) continue
      const list = partialsBy.get(p.parentEntryId) ?? []
      list.push({ amount: Number(p.amount), interestAmount: p.interestAmount == null ? null : Number(p.interestAmount), discountAmount: p.discountAmount == null ? null : Number(p.discountAmount) })
      partialsBy.set(p.parentEntryId, list)
    }
    const parentMap = new Map(parents.map((p) => [p.id, p]))
    const partialNumberOf = (source: string | null) => {
      const n = Number(source?.split(PARTIAL_SOURCE_SEP)[1])
      return Number.isFinite(n) && n > 0 ? n : null
    }

    const vMap = new Map(vehicles.map((v) => [v.id, v])); const sMap = new Map(suppliers.map((s) => [s.id, s.name]))
    const dMap = new Map(deals.map((d) => [d.id, { id: d.id, dealNumber: d.dealNumber, customer: d.person?.nomeCompleto ?? d.customer?.name ?? null }]))

    const data = rows.map((e) => ({
      id: e.id, type: e.type, status: e.status,
      overdue: e.status === 'PREVISTO' && !!e.dueDate && e.dueDate < todayStart,
      description: e.description, amount: Number(e.amount),
      dueDate: e.dueDate, paidDate: e.paidDate, competenceDate: e.competenceDate,
      account: e.account, category: e.category, costCenter: e.costCenter,
      counterparty: e.counterparty ?? (e.supplierId ? sMap.get(e.supplierId) ?? null : null) ?? (e.dealId ? dMap.get(e.dealId)?.customer ?? null : null),
      deal: e.dealId ? dMap.get(e.dealId) ?? null : null,
      supplierId: e.supplierId, documentNumber: e.documentNumber, paymentMethod: e.paymentMethod, notes: e.notes,
      source: e.source, deletable: !e.parentEntryId && !partialsBy.get(e.id)?.length && isDeletableSource(e.source),
      linked: !!e.commissionCalculationId || !!e.vehicleServiceId,
      installmentNumber: e.installmentNumber, installmentTotal: e.installmentTotal, installmentGroupId: e.installmentGroupId,
      recurrenceId: e.recurrenceId, employeeUserId: e.employeeUserId, unitId: e.unitId,
      interestAmount: e.interestAmount == null ? null : Number(e.interestAmount),
      discountAmount: e.discountAmount == null ? null : Number(e.discountAmount),
      vehicle: e.vehicleId && vMap.get(e.vehicleId) ? { id: e.vehicleId, plate: vMap.get(e.vehicleId)!.plate, title: [vMap.get(e.vehicleId)!.brand, vMap.get(e.vehicleId)!.model].filter(Boolean).join(' ') } : null,
      attachments: e._count.attachments,
      ...(e.parentEntryId
        ? {
            isPartialSettlement: true as const, partialNumber: partialNumberOf(e.source),
            parent: parentMap.get(e.parentEntryId) ?? { id: e.parentEntryId, description: '' },
          }
        : {
            isPartialSettlement: false as const,
            partialCount: partialsBy.get(e.id)?.length ?? 0,
            partialBlocked: partialBlockedReason(e),
            summary: titleSummary(
              { status: e.status, amount: Number(e.amount), interestAmount: e.interestAmount == null ? null : Number(e.interestAmount), discountAmount: e.discountAmount == null ? null : Number(e.discountAmount) },
              partialsBy.get(e.id) ?? [],
            ),
          }),
    }))
    const sum = (a: { _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }) => ({ count: a._count._all, amount: Number(a._sum.amount ?? 0) })
    return NextResponse.json({
      success: true, data,
      summary: { aberto: sum(aAberto), vencidos: sum(aVenc), pagos: sum(aPagos), cancelados: sum(aCanc), todos: sum(aTodos) },
      canManage: manage, canPayroll: payroll,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

const optId = z.string().max(40).nullable().optional()
const optText = (max: number) => z.string().trim().max(max).nullable().optional()
const ymd = z.string().regex(YMD, 'Data inválida.')

const createSchema = z.object({
  type: z.enum(['RECEITA', 'DESPESA']),
  description: z.string().trim().min(2, 'Informe a descrição.').max(240),
  amount: z.coerce.number().positive('Informe o valor.').max(100_000_000),
  dueDate: ymd,
  competenceDate: ymd.nullable().optional(),
  accountId: optId, categoryId: optId, costCenterId: optId, supplierId: optId, vehicleId: optId, employeeUserId: optId, dealId: optId,
  counterparty: optText(160), documentNumber: optText(80), paymentMethod: optText(60), notes: optText(2000),
  installments: z.coerce.number().int().min(1).max(120).optional(),
  paid: z.object({ paidDate: ymd, accountId: optId }).nullable().optional(),
})

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  try {
    const d = createSchema.parse(await req.json())
    if (d.employeeUserId && !(await canPayroll(user))) return bad('Sem acesso à folha.', 403)
    await ensureFinanceSetup(tenantId)
    const refErr = await centerRefError(tenantId, { ...d, accountId: d.paid?.accountId || d.accountId })
      ?? await categoryKindError(d.categoryId, d.type)
    if (refErr) return bad(refErr)
    const closed = await periodError(tenantId, [d.competenceDate ?? d.dueDate, d.paid?.paidDate])
    if (closed) return bad(closed)
    if (d.vehicleId && !(await prisma.vehicle.findFirst({ where: { id: d.vehicleId, tenantId }, select: { id: true } }))) return bad('Veículo inválido.')

    const deal = d.dealId ? await dealForEntry(tenantId, d.dealId) : null
    if (d.dealId && !deal) return bad('Negociação inválida.')
    const counterparty = d.counterparty || (await supplierName(d.supplierId)) || deal?.customer || null
    const vehicleId = d.vehicleId || deal?.vehicleId || null
    const n = d.installments ?? 1
    const plan = buildInstallmentPlan({ description: d.description, total: d.amount, count: n, firstDueDate: d.dueDate })
    const groupId = n > 1 ? randomUUID() : null
    const settledStatus = d.type === 'DESPESA' ? 'PAGO' : 'RECEBIDO'

    const created = await prisma.$transaction(plan.map((p, i) => {
      const paidNow = !!d.paid && i === 0
      // Competência: a informada vale para a 1ª parcela; as demais seguem o vencimento.
      const competence = i === 0 && d.competenceDate ? d.competenceDate : p.dueDate
      return prisma.financialEntry.create({
        data: {
          tenantId, type: d.type, status: paidNow ? settledStatus : 'PREVISTO',
          description: p.description, amount: p.amount,
          dueDate: noonUtc(p.dueDate), competenceDate: noonUtc(competence),
          paidDate: paidNow ? noonUtc(d.paid!.paidDate) : null,
          accountId: (paidNow ? d.paid!.accountId : null) || d.accountId || null,
          categoryId: d.categoryId || null, costCenterId: d.costCenterId || null, supplierId: d.supplierId || null,
          vehicleId, employeeUserId: d.employeeUserId || null, dealId: deal?.id ?? null,
          counterparty: counterparty || null, documentNumber: d.documentNumber || null,
          paymentMethod: d.paymentMethod || null, notes: d.notes || null,
          installmentGroupId: groupId, installmentNumber: n > 1 ? p.number : null, installmentTotal: n > 1 ? n : null,
          source: deal ? `${MANUAL_DEAL_SOURCE_PREFIX}${randomUUID()}` : 'MANUAL', createdById: user.id,
        },
        select: { id: true, description: true, amount: true, dueDate: true, status: true },
      })
    }))
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialEntry', entityId: created[0].id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: created.map((c) => ({ ...c, amount: Number(c.amount) })) }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
