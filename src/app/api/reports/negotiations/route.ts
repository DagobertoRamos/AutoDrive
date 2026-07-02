// =============================================================================
// /api/reports/negotiations?type=VENDA|TROCA|COMPRA|CONSIGNACAO — read-only
// Negociações por tipo: summary (total, finalizadas, valor realizado), quebra
// por status e lista. Multi-tenant. Valor = saleAmount (venda/troca/consignação)
// ou purchaseAmount (compra).
// =============================================================================

import { NextResponse } from 'next/server'
import type { DealType } from '@prisma/client'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

const TYPES: DealType[] = ['VENDA', 'TROCA', 'COMPRA', 'CONSIGNACAO']
const num = (v: unknown): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')
  { const gate = await assertModuleEnabled(user, 'logs'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const typeParam = (searchParams.get('type') ?? 'VENDA') as DealType
    const type: DealType = TYPES.includes(typeParam) ? typeParam : 'VENDA'
    const isPurchase = type === 'COMPRA'

    const where = await buildNegotiationAccessWhere(user, tenantWhere(user.role, tenantId, { type }) as never)

    const [byStatusRaw, deals] = await Promise.all([
      prisma.deal.groupBy({ by: ['status'], where: where as never, _count: { _all: true } }),
      prisma.deal.findMany({
        where: where as never,
        orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        select: {
          id: true, dealNumber: true, status: true, saleAmount: true, purchaseAmount: true,
          saleDate: true, finalizedAt: true, createdAt: true,
          seller: { select: { fullName: true, shortName: true } },
          person: { select: { nomeCompleto: true } },
          vehicles: { select: { brand: true, model: true, plate: true }, take: 1 },
        },
      }),
    ])

    const data = deals.map((d) => {
      const v = d.vehicles[0]
      return {
        id: d.id, dealNumber: d.dealNumber, status: d.status,
        value: isPurchase ? num(d.purchaseAmount) : num(d.saleAmount),
        seller: d.seller?.shortName || d.seller?.fullName || '—',
        customer: d.person?.nomeCompleto || '—',
        vehicle: v ? [v.brand, v.model].filter(Boolean).join(' ') : '—',
        plate: v?.plate ?? null,
        date: d.finalizedAt ?? d.saleDate ?? d.createdAt,
      }
    })

    const finalizadas = data.filter((d) => d.status === 'FINALIZADA')
    return NextResponse.json({
      success: true,
      type,
      summary: {
        count: data.length,
        finalizadas: finalizadas.length,
        valorRealizado: finalizadas.reduce((s, d) => s + d.value, 0),
        valorTotal: data.reduce((s, d) => s + d.value, 0),
      },
      byStatus: byStatusRaw.map((g) => ({ status: g.status, count: g._count._all })).sort((a, b) => b.count - a.count),
      data,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
