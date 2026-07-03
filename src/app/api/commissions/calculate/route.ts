// =============================================================================
// API: /api/commissions/calculate — Fechamento por período
//
// POST { period: "YYYY-MM", unitId? } → agrega os LANÇAMENTOS já gerados
// (CommissionCalculation) por VENDEDOR no período, somando a comissão. Devolve
// { data: [{ sellerId, sellerName, period, baseValue, adjustments, finalValue }] }
// para a tela de Cálculo revisar e salvar (POST /api/commissions → extrato).
//
// Não recalcula regra aqui (isso é o motor/gerador); apenas soma o que existe.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const num = (v: unknown): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'commissions.calculate')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions.calculate'); if (gate) return gate }

    const tenantId = session.user.tenantId ?? null
    const body = await req.json().catch(() => ({}))
    const period = String(body?.period ?? '').trim()
    const unitId = body?.unitId ? String(body.unitId) : null

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return NextResponse.json({ success: false, error: 'Informe um período válido (AAAA-MM).' }, { status: 400 })
    }

    // Agrega a comissão de VENDEDOR (sellerId) no período. Ignora canceladas.
    const where: Prisma.CommissionCalculationWhereInput = {
      tenantId,
      period,
      sellerId: { not: null },
      status: { not: 'CANCELADO' },
      ...(unitId ? { unitId } : {}),
    }

    const grouped = await prisma.commissionCalculation.groupBy({
      by: ['sellerId'],
      where,
      _sum: { commissionValue: true },
    })

    const sellerIds = grouped.map((g) => g.sellerId).filter((v): v is string => !!v)
    const sellers = sellerIds.length
      ? await prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, fullName: true, shortName: true } })
      : []
    const nameById = new Map(sellers.map((s) => [s.id, s.shortName || s.fullName]))

    const data = grouped
      .filter((g) => g.sellerId)
      .map((g) => {
        const baseValue = num(g._sum.commissionValue)
        return {
          sellerId:   g.sellerId as string,
          sellerName: nameById.get(g.sellerId as string) ?? '—',
          period,
          baseValue,
          adjustments: 0,
          finalValue: baseValue,
        }
      })
      .sort((a, b) => b.finalValue - a.finalValue)

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[POST /api/commissions/calculate]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
