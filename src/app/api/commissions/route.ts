// =============================================================================
// API: /api/commissions — AutoDrive
// Listagem e gravação de extratos de comissão
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildCommissionExtractAccessWhere } from '@/lib/negotiation-access'
import type { Prisma } from '@prisma/client'

const num = (v: unknown): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

// ── GET — lista extratos ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions'); if (gate) return gate }

    const { searchParams } = new URL(req.url)
    const page    = Math.max(1, Number(searchParams.get('page')    ?? 1))
    const perPage = Math.min(100, Number(searchParams.get('perPage') ?? 50))
    const status  = searchParams.get('status')  || undefined
    const period  = searchParams.get('period')  || undefined
    const seller  = searchParams.get('sellerId')|| undefined

    const extra: Prisma.CommissionExtractWhereInput = {}
    if (status) extra.status   = status as Prisma.CommissionExtractWhereInput['status']
    if (period) extra.period   = period
    if (seller) extra.sellerId = seller

    // Visibilidade: MASTER/ADM/FINANCEIRO veem tudo; demais só o próprio.
    const where = await buildCommissionExtractAccessWhere(session.user, extra)

    // As linhas do extrato são BASE/AJUSTE por vendedor+período. Agrega em uma
    // linha por (vendedor, período): baseValue = soma das BASE; adjustments =
    // soma das AJUSTE/DESCONTO; finalValue = base + ajustes.
    const rows = await prisma.commissionExtract.findMany({
      where,
      include: { seller: { select: { fullName: true, shortName: true } } },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      take: 5000,
    })

    type Group = {
      id: string; sellerId: string; period: string
      baseValue: number; adjustments: number
      status: string; paidAt: Date | null
      seller: { fullName: string; shortName: string | null } | null
    }
    const STATUS_RANK: Record<string, number> = { PREVISTO: 0, APROVADO: 1, PAGO: 2, AJUSTADO: 1, CANCELADO: 3 }
    const groups = new Map<string, Group>()
    for (const r of rows) {
      const sid = r.sellerId ?? r.userId
      const key = `${sid}::${r.period}`
      const g = groups.get(key) ?? {
        id: key, sellerId: sid, period: r.period,
        baseValue: 0, adjustments: 0, status: r.status, paidAt: r.paidAt,
        seller: r.seller ?? null,
      }
      const v = num(r.value)
      if (r.type === 'AJUSTE' || r.type === 'DESCONTO') g.adjustments += v
      else g.baseValue += v
      // status "menos avançado" do grupo (o que falta liberar/pagar aparece).
      if ((STATUS_RANK[r.status] ?? 0) < (STATUS_RANK[g.status] ?? 0)) g.status = r.status
      if (r.paidAt && !g.paidAt) g.paidAt = r.paidAt
      groups.set(key, g)
    }

    const all = [...groups.values()].map((g) => ({
      id: g.id,
      sellerId: g.sellerId,
      period: g.period,
      baseValue: g.baseValue,
      adjustments: g.adjustments,
      finalValue: g.baseValue + g.adjustments,
      status: g.status,
      paidAt: g.paidAt,
      seller: g.seller,
    }))

    const total = all.length
    const data = all.slice((page - 1) * perPage, (page - 1) * perPage + perPage)

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    })
  } catch (err) {
    console.error('[GET /api/commissions]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── POST — grava extratos calculados ─────────────────────────────────────────
// Recebe: { period: string, results: Array<{sellerId, sellerName, baseValue, adjustments, finalValue}> }
// Cada item gera 1-3 entradas no CommissionExtract conforme valor
export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.calculate')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions.calculate'); if (gate) return gate }

    const { period, results } = await req.json() as {
      period: string
      results: Array<{ sellerId: string; sellerName: string; baseValue: number; adjustments: number; finalValue: number }>
    }

    if (!period || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ success: false, error: 'Dados inválidos.' }, { status: 400 })
    }

    // Buscar userId de cada vendedor para preencher campo obrigatório
    const sellerIds = [...new Set(results.map((r) => r.sellerId))]
    const sellers   = await prisma.seller.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, userId: true, fullName: true, shortName: true },
    })
    const sellerMap = Object.fromEntries(sellers.map((s) => [s.id, s]))

    const creates: ReturnType<typeof prisma.commissionExtract.create>[] = []

    for (const r of results) {
      const seller = sellerMap[r.sellerId]
      if (!seller) continue
      const userId = seller.userId

      // Valor base
      if (r.baseValue !== 0) {
        creates.push(
          prisma.commissionExtract.create({
            data: {
              userId,
              sellerId:    r.sellerId,
              period,
              type:        'BASE',
              description: `Base — ${seller.shortName ?? seller.fullName}`,
              value:       r.baseValue,
              status:      'PREVISTO',
            },
          }),
        )
      }

      // Ajustes (positivo ou negativo)
      if (r.adjustments !== 0) {
        creates.push(
          prisma.commissionExtract.create({
            data: {
              userId,
              sellerId:    r.sellerId,
              period,
              type:        'AJUSTE',
              description: `Ajuste — ${seller.shortName ?? seller.fullName}`,
              value:       r.adjustments,
              status:      'PREVISTO',
            },
          }),
        )
      }
    }

    const created = await Promise.all(creates)

    return NextResponse.json({ success: true, data: created, count: created.length }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/commissions]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
