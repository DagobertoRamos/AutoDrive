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

    // Visibilidade central (Parte 9): OWN=próprias, UNIT=unidade do gerente,
    // ALL=tenant. O escopo é aplicado por último e sobrescreve qualquer
    // ?sellerId= alheio — vendedor/vendedor-líder só veem as próprias.
    const where = await buildCommissionExtractAccessWhere(session.user, extra)

    const [total, data] = await Promise.all([
      prisma.commissionExtract.count({ where }),
      prisma.commissionExtract.findMany({
        where,
        include: { seller: { select: { fullName: true, shortName: true } } },
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        skip:    (page - 1) * perPage,
        take:    perPage,
      }),
    ])

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
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
