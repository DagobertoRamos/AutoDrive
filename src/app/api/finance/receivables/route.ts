// =============================================================================
// GET /api/finance/receivables — Financeiro › Recebimentos: pagamentos das
// negociações (o que o cliente pagou/vai pagar) para o financeiro conferir e
// confirmar. Filtros (todos opcionais, combináveis):
//   status=PENDENTE|CONFIRMADO|CANCELADO|TODOS (padrão PENDENTE)
//   q=      negociação, cliente, placa ou banco/financeira
//   unitId= unidade da negociação (deal.unitId)
//   from=, to= YYYY-MM-DD (dia de São Paulo) sobre dateBy=vencimento|pagamento
//          (padrão vencimento = dueDate; pagamento = paidAt)
//   type=   forma (lista separada por vírgula) — casa com type OU method
//           (ex.: CARTAO_CREDITO pega também sinal pago no cartão)
//   bank=   banco/financeira (contém, sem diferenciar maiúsculas)
// Traz o comprovante (anexo do pagamento), a autorização do cartão e a forma do
// sinal. Só formas que ENTRAM dinheiro (quitação e troco ficam de fora).
// `summary` = contagem/total do conjunto filtrado inteiro (a lista vem limitada
// a 300) e quebra por forma; `units`/`banks` alimentam os filtros da tela.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { loadTracks } from '@/lib/finance/fi-contract-track'
import { legacyFinanceGuard, canManage } from '@/app/api/finance/center/entries/_lib/shared'
import { handlePrismaError } from '@/lib/prisma-errors'
import { parseAddOns } from '@/lib/finance/fi-receipt-core'

export const dynamic = 'force-dynamic'

const OUT_TYPES = ['QUITACAO', 'TROCO']
const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const g = await legacyFinanceGuard('finance', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  try {
    const sp = req.nextUrl.searchParams
    const status = (sp.get('status') ?? 'PENDENTE').toUpperCase()
    const q = (sp.get('q') ?? '').trim()
    const unitId = (sp.get('unitId') ?? '').trim()
    const bank = (sp.get('bank') ?? '').trim()
    const types = (sp.get('type') ?? '').split(',').map((t) => t.trim().toUpperCase()).filter((t) => /^[A-Z_]{2,30}$/.test(t))
    const dateField = (sp.get('dateBy') ?? '').toLowerCase() === 'pagamento' ? 'paidAt' : 'dueDate'
    const from = YMD.test(sp.get('from') ?? '') ? sp.get('from')! : null
    const to = YMD.test(sp.get('to') ?? '') ? sp.get('to')! : null

    const statusWhere: Prisma.DealPaymentWhereInput = status === 'CONFIRMADO' ? { status: 'CONFIRMADO' } : status === 'CANCELADO' ? { status: 'CANCELADO' } : status === 'TODOS' ? {} : { OR: [{ status: 'PENDENTE' }, { status: null }] }
    const dealWhere: Prisma.DealWhereInput = { ...(tenantId ? { tenantId } : {}), status: { not: 'CANCELADA' }, ...(unitId ? { unitId } : {}) }
    const and: Prisma.DealPaymentWhereInput[] = [statusWhere, { type: { notIn: OUT_TYPES } }, { deal: dealWhere }]
    if (q) {
      const plate = q.replace(/[^a-z0-9]/gi, '')
      and.push({
        OR: [
          { deal: { dealNumber: { contains: q, mode: 'insensitive' } } },
          { deal: { customer: { name: { contains: q, mode: 'insensitive' } } } },
          { deal: { person: { nomeCompleto: { contains: q, mode: 'insensitive' } } } },
          ...(plate.length >= 3 ? [
            { deal: { vehicles: { some: { plate: { contains: plate, mode: 'insensitive' as const } } } } },
            { vehiclePlate: { contains: plate, mode: 'insensitive' as const } },
          ] : []),
          { bank: { contains: q, mode: 'insensitive' } },
        ],
      })
    }
    if (bank) and.push({ bank: { contains: bank, mode: 'insensitive' } })
    if (types.length) and.push({ OR: [{ type: { in: types } }, { method: { in: types } }] })
    if (from || to) {
      and.push({ [dateField]: { ...(from ? { gte: new Date(`${from}T00:00:00.000-03:00`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999-03:00`) } : {}) } })
    }
    const where: Prisma.DealPaymentWhereInput = { AND: and }

    const [rows, agg, byTypeRaw, unitsRaw, banksRaw] = await Promise.all([prisma.dealPayment.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 300,
      include: {
        deal: {
          select: {
            id: true, dealNumber: true, status: true, type: true, unitId: true,
            customer: { select: { name: true } }, person: { select: { nomeCompleto: true } },
            seller: { select: { fullName: true } },
            financedAmount: true, returnRatePercent: true, returnGrossValue: true, ilaPercent: true, ilaValue: true,
            iofPercent: true, iofValue: true, returnNetValue: true,
            _count: { select: { payments: { where: { type: 'FINANCIAMENTO' } } } },
            vehicles: { where: { role: { in: ['VENDIDO', 'CONSIGNADO', 'COMPRADO'] } }, select: { plate: true, brand: true, model: true }, take: 1 },
          },
        },
      },
    }),
    prisma.dealPayment.aggregate({ where, _sum: { value: true }, _count: { _all: true } }),
    prisma.dealPayment.groupBy({ by: ['type'], where, _sum: { value: true }, _count: { _all: true } }),
    tenantId ? prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true, active: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    prisma.dealPayment.findMany({
      where: { type: { notIn: OUT_TYPES }, bank: { not: null }, NOT: { bank: '' }, deal: tenantId ? { tenantId } : {} },
      distinct: ['bank'], select: { bank: true }, orderBy: { bank: 'asc' }, take: 80,
    }),
    ])
    const unitName = new Map(unitsRaw.map((u) => [u.id, u.name]))
    const ids = rows.map((r) => r.id)
    const atts = ids.length ? await prisma.dealAttachment.findMany({ where: { paymentId: { in: ids } }, select: { id: true, paymentId: true, fileName: true, publicUrl: true, fileType: true }, orderBy: { uploadedAt: 'desc' } }) : []
    const finIds = rows.filter((r) => r.type === 'FINANCIAMENTO').map((r) => r.id)
    const cbs = finIds.length ? await prisma.financialEntry.findMany({ where: { source: { in: finIds.map((id) => `NEG_CHARGEBACK_${id}`) }, status: { not: 'CANCELADO' } }, select: { source: true, amount: true, paidDate: true, notes: true } }) : []
    const tracks = await loadTracks(finIds)
    const cbOf = new Map(cbs.map((c) => [String(c.source).slice('NEG_CHARGEBACK_'.length), { amount: Number(c.amount), date: c.paidDate, reason: c.notes }]))
    const n = (v: unknown) => (v == null ? null : Number(v))
    const data = rows.map((r) => ({
      id: r.id, type: r.type, method: r.method, status: r.status ?? 'PENDENTE', value: Number(r.value),
      dueDate: r.dueDate, paidAt: r.paidAt, bank: r.bank, cardBrand: r.cardBrand, installments: r.installments,
      authorizationCode: r.authorizationCode, notes: r.notes, createdAt: r.createdAt,
      deal: { id: r.deal.id, number: r.deal.dealNumber, status: r.deal.status, unitId: r.deal.unitId, unit: r.deal.unitId ? unitName.get(r.deal.unitId) ?? null : null, client: r.deal.person?.nomeCompleto ?? r.deal.customer?.name ?? null, seller: r.deal.seller?.fullName ?? null, vehicle: r.deal.vehicles[0] ? [r.deal.vehicles[0].brand, r.deal.vehicles[0].model].filter(Boolean).join(' ') : null, plate: r.vehiclePlate ?? r.deal.vehicles[0]?.plate ?? null },
      receipts: atts.filter((a) => a.paymentId === r.id).map((a) => ({ id: a.id, fileName: a.fileName, url: a.publicUrl, fileType: a.fileType })),
      // F&I do contrato (só financiamento). `dealReturn` = cálculo da negociação,
      // usado como sugestão quando o contrato ainda não foi conferido; só vem
      // quando este é o único financiamento da negociação (senão duplicaria).
      fi: r.type === 'FINANCIAMENTO' ? {
        contractNumber: r.contractNumber, installmentValue: n(r.installmentValue), returnPct: n(r.returnPct),
        returnGrossValue: n(r.returnGrossValue), ilaValue: n(r.ilaValue), iofValue: n(r.iofValue), irrfValue: n(r.irrfValue),
        returnNetValue: n(r.returnNetValue), plusValue: n(r.plusValue), addOns: parseAddOns(r.addOns),
        chargeback: cbOf.get(r.id) ?? null,
        track: tracks.get(r.id) ?? null,
        dealReturn: r.deal._count.payments <= 1 ? {
          financedAmount: n(r.deal.financedAmount), returnRatePercent: n(r.deal.returnRatePercent), returnGrossValue: n(r.deal.returnGrossValue),
          ilaPercent: n(r.deal.ilaPercent), ilaValue: n(r.deal.ilaValue), iofPercent: n(r.deal.iofPercent), iofValue: n(r.deal.iofValue),
          returnNetValue: n(r.deal.returnNetValue),
        } : { returnRatePercent: n(r.deal.returnRatePercent) },
      } : null,
    }))
    const products = tenantId && data.some((r) => r.fi)
      ? (await prisma.financeProduct.findMany({ where: { tenantId, active: true }, select: { name: true, kind: true, defaultValue: true }, orderBy: { name: 'asc' }, take: 100 }))
        .map((p) => ({ name: p.name, kind: p.kind, defaultValue: n(p.defaultValue) }))
      : []
    const total = Number(agg._sum.value ?? 0)
    const summary = {
      count: agg._count._all,
      total,
      shown: data.length,
      byType: byTypeRaw.map((t) => ({ type: t.type, count: t._count._all, total: Number(t._sum.value ?? 0) })).sort((a, b) => b.total - a.total),
    }
    const units = unitsRaw.filter((u) => u.active || data.some((r) => r.deal.unitId === u.id)).map((u) => ({ id: u.id, name: u.name }))
    const banks = [...new Set(banksRaw.map((b) => (b.bank ?? '').trim()).filter(Boolean))]
    return NextResponse.json({ success: true, data, total, summary, units, banks, products, canManage: await canManage(user) })
  } catch (err) {
    return handlePrismaError(err)
  }
}
