// =============================================================================
// GET /api/finance/receivables — Financeiro › Recebimentos: pagamentos das
// negociações (o que o cliente pagou/vai pagar) para o financeiro conferir e
// confirmar. ?status=PENDENTE|CONFIRMADO|CANCELADO (padrão PENDENTE) &q=
// Traz o comprovante (anexo do pagamento), a autorização do cartão e a forma do
// sinal. Só formas que ENTRAM dinheiro (quitação e troco ficam de fora).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

const OUT_TYPES = ['QUITACAO', 'TROCO']

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance')) return forbiddenResponse()
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const sp = req.nextUrl.searchParams
    const status = (sp.get('status') ?? 'PENDENTE').toUpperCase()
    const q = (sp.get('q') ?? '').trim()
    const statusWhere = status === 'CONFIRMADO' ? { status: 'CONFIRMADO' } : status === 'CANCELADO' ? { status: 'CANCELADO' } : { OR: [{ status: 'PENDENTE' }, { status: null }] }
    const dealWhere: Record<string, unknown> = { ...(user.role === 'MASTER' ? {} : { tenantId }), status: { not: 'CANCELADA' } }
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
            vehicles: { where: { role: { in: ['VENDIDO', 'CONSIGNADO', 'COMPRADO'] } }, select: { plate: true, brand: true, model: true }, take: 1 },
          },
        },
      },
    })
    const ids = rows.map((r) => r.id)
    const atts = ids.length ? await prisma.dealAttachment.findMany({ where: { paymentId: { in: ids } }, select: { id: true, paymentId: true, fileName: true, publicUrl: true, fileType: true }, orderBy: { uploadedAt: 'desc' } }) : []
    const data = rows.map((r) => ({
      id: r.id, type: r.type, method: r.method, status: r.status ?? 'PENDENTE', value: Number(r.value),
      dueDate: r.dueDate, paidAt: r.paidAt, bank: r.bank, cardBrand: r.cardBrand, installments: r.installments,
      authorizationCode: r.authorizationCode, notes: r.notes, createdAt: r.createdAt,
      deal: { id: r.deal.id, number: r.deal.dealNumber, status: r.deal.status, client: r.deal.person?.nomeCompleto ?? r.deal.customer?.name ?? null, seller: r.deal.seller?.fullName ?? null, vehicle: r.deal.vehicles[0] ? [r.deal.vehicles[0].brand, r.deal.vehicles[0].model].filter(Boolean).join(' ') : null, plate: r.vehiclePlate ?? r.deal.vehicles[0]?.plate ?? null },
      receipts: atts.filter((a) => a.paymentId === r.id).map((a) => ({ id: a.id, fileName: a.fileName, url: a.publicUrl, fileType: a.fileType })),
    }))
    const total = data.reduce((s, r) => s + r.value, 0)
    return NextResponse.json({ success: true, data, total, canManage: canAccessModule(user.role, 'finance.manage') })
  } catch (err) {
    return handlePrismaError(err)
  }
}
