// =============================================================================
// GET /api/finance/receivables — Financeiro › Recebimentos: pagamentos das
// negociações (o que o cliente pagou/vai pagar) para o financeiro conferir e
// confirmar. ?status=PENDENTE|CONFIRMADO|CANCELADO (padrão PENDENTE) &q=
// Traz o comprovante (anexo do pagamento), a autorização do cartão e a forma do
// sinal. Só formas que ENTRAM dinheiro (quitação e troco ficam de fora).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { legacyFinanceGuard, canManage } from '@/app/api/finance/center/entries/_lib/shared'
import { handlePrismaError } from '@/lib/prisma-errors'
import { parseAddOns } from '@/lib/finance/fi-receipt-core'

export const dynamic = 'force-dynamic'

const OUT_TYPES = ['QUITACAO', 'TROCO']

export async function GET(req: NextRequest) {
  const g = await legacyFinanceGuard('finance', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  try {
    const sp = req.nextUrl.searchParams
    const status = (sp.get('status') ?? 'PENDENTE').toUpperCase()
    const q = (sp.get('q') ?? '').trim()
    const statusWhere = status === 'CONFIRMADO' ? { status: 'CONFIRMADO' } : status === 'CANCELADO' ? { status: 'CANCELADO' } : { OR: [{ status: 'PENDENTE' }, { status: null }] }
    const dealWhere: Record<string, unknown> = { ...(tenantId ? { tenantId } : {}), status: { not: 'CANCELADA' } }
    if (q) {
      dealWhere.OR = [
        { dealNumber: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { person: { nomeCompleto: { contains: q, mode: 'insensitive' } } },
        { vehicles: { some: { plate: { contains: q.replace(/[^a-z0-9]/gi, ''), mode: 'insensitive' } } } },
      ]
    }
    const rows = await prisma.dealPayment.findMany({
      where: { ...statusWhere, type: { notIn: OUT_TYPES }, deal: dealWhere as never },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 300,
      include: {
        deal: {
          select: {
            id: true, dealNumber: true, status: true, type: true,
            customer: { select: { name: true } }, person: { select: { nomeCompleto: true } },
            seller: { select: { fullName: true } },
            financedAmount: true, returnRatePercent: true, returnGrossValue: true, ilaPercent: true, ilaValue: true,
            iofPercent: true, iofValue: true, returnNetValue: true,
            _count: { select: { payments: { where: { type: 'FINANCIAMENTO' } } } },
            vehicles: { where: { role: { in: ['VENDIDO', 'CONSIGNADO', 'COMPRADO'] } }, select: { plate: true, brand: true, model: true }, take: 1 },
          },
        },
      },
    })
    const ids = rows.map((r) => r.id)
    const atts = ids.length ? await prisma.dealAttachment.findMany({ where: { paymentId: { in: ids } }, select: { id: true, paymentId: true, fileName: true, publicUrl: true, fileType: true }, orderBy: { uploadedAt: 'desc' } }) : []
    const n = (v: unknown) => (v == null ? null : Number(v))
    const data = rows.map((r) => ({
      id: r.id, type: r.type, method: r.method, status: r.status ?? 'PENDENTE', value: Number(r.value),
      dueDate: r.dueDate, paidAt: r.paidAt, bank: r.bank, cardBrand: r.cardBrand, installments: r.installments,
      authorizationCode: r.authorizationCode, notes: r.notes, createdAt: r.createdAt,
      deal: { id: r.deal.id, number: r.deal.dealNumber, status: r.deal.status, client: r.deal.person?.nomeCompleto ?? r.deal.customer?.name ?? null, seller: r.deal.seller?.fullName ?? null, vehicle: r.deal.vehicles[0] ? [r.deal.vehicles[0].brand, r.deal.vehicles[0].model].filter(Boolean).join(' ') : null, plate: r.vehiclePlate ?? r.deal.vehicles[0]?.plate ?? null },
      receipts: atts.filter((a) => a.paymentId === r.id).map((a) => ({ id: a.id, fileName: a.fileName, url: a.publicUrl, fileType: a.fileType })),
      // F&I do contrato (só financiamento). `dealReturn` = cálculo da negociação,
      // usado como sugestão quando o contrato ainda não foi conferido; só vem
      // quando este é o único financiamento da negociação (senão duplicaria).
      fi: r.type === 'FINANCIAMENTO' ? {
        contractNumber: r.contractNumber, installmentValue: n(r.installmentValue), returnPct: n(r.returnPct),
        returnGrossValue: n(r.returnGrossValue), ilaValue: n(r.ilaValue), iofValue: n(r.iofValue), irrfValue: n(r.irrfValue),
        returnNetValue: n(r.returnNetValue), plusValue: n(r.plusValue), addOns: parseAddOns(r.addOns),
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
    const total = data.reduce((s, r) => s + r.value, 0)
    return NextResponse.json({ success: true, data, total, products, canManage: await canManage(user) })
  } catch (err) {
    return handlePrismaError(err)
  }
}
