// =============================================================================
// API: /api/commissions — AutoDrive
// Listagem e gravação de extratos de comissão
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildCommissionAccessWhere } from '@/lib/negotiation-access'
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
    const perPage = Math.min(200, Number(searchParams.get('perPage') ?? 100))
    const status  = searchParams.get('status')  || undefined
    const period  = searchParams.get('period')  || undefined
    const seller  = searchParams.get('sellerId')|| undefined

    // O extrato mostra a comissão REAL gerada (CommissionCalculation, os
    // Lançamentos), agregada por COLABORADOR + período — não depende de nenhum
    // "fechamento" manual. Visibilidade: MASTER/ADM/GERENTE_GERAL/FINANCEIRO veem
    // todos; demais só o próprio.
    const extra: Prisma.CommissionCalculationWhereInput = {}
    if (status) extra.status = status as Prisma.CommissionCalculationWhereInput['status']
    if (period) extra.period = period
    if (seller) extra.sellerId = seller

    const where = await buildCommissionAccessWhere(session.user, extra)

    const rows = await prisma.commissionCalculation.findMany({
      where,
      select: { sellerId: true, managerId: true, ruleDetails: true, period: true, commissionValue: true, status: true },
      orderBy: [{ period: 'desc' }],
      take: 20000,
    })

    // Resolve nomes dos colaboradores (vendedor/gerente/usuário-ganhador).
    const detailsOf = (v: unknown): Record<string, unknown> =>
      v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
    const sellerIds = [...new Set(rows.map((r) => r.sellerId).filter(Boolean))] as string[]
    const managerIds = [...new Set(rows.map((r) => r.managerId).filter(Boolean))] as string[]
    const userIds = [...new Set(rows.map((r) => detailsOf(r.ruleDetails).employeeUserId).filter(Boolean))] as string[]
    const [sellers, managers, users] = await Promise.all([
      sellerIds.length ? prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, fullName: true, shortName: true } }) : [],
      managerIds.length ? prisma.manager.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true, user: { select: { name: true } } } }) : [],
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    ])
    const sellerMap = Object.fromEntries(sellers.map((s) => [s.id, s.shortName || s.fullName]))
    const managerMap = Object.fromEntries(managers.map((m) => [m.id, m.fullName || m.user?.name || 'Gerente']))
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

    type Group = { id: string; earnerId: string; responsavel: string; period: string; baseValue: number; status: string }
    const STATUS_RANK: Record<string, number> = { PREVISTO: 0, AJUSTADO: 1, APROVADO: 1, PAGO: 2, CANCELADO: 3 }
    const groups = new Map<string, Group>()
    for (const r of rows) {
      if (r.status === 'CANCELADO') continue
      let earnerId = ''
      let responsavel = '—'
      if (r.sellerId) { earnerId = `s:${r.sellerId}`; responsavel = sellerMap[r.sellerId] ?? '—' }
      else if (r.managerId) { earnerId = `m:${r.managerId}`; responsavel = managerMap[r.managerId] ?? '—' }
      else {
        const uid = String(detailsOf(r.ruleDetails).employeeUserId ?? '')
        earnerId = `u:${uid}`; responsavel = userMap[uid] ?? '—'
      }
      const key = `${earnerId}::${r.period}`
      const g = groups.get(key) ?? { id: key, earnerId, responsavel, period: r.period, baseValue: 0, status: r.status }
      g.baseValue += num(r.commissionValue)
      if ((STATUS_RANK[r.status] ?? 0) < (STATUS_RANK[g.status] ?? 0)) g.status = r.status
      groups.set(key, g)
    }

    const all = [...groups.values()]
      .map((g) => ({
        id: g.id,
        sellerId: g.earnerId,
        responsavel: g.responsavel,
        period: g.period,
        baseValue: g.baseValue,
        adjustments: 0,
        finalValue: g.baseValue,
        status: g.status,
        paidAt: null as Date | null,
        seller: { fullName: g.responsavel, shortName: g.responsavel },
      }))
      .sort((a, b) => (a.period === b.period ? b.finalValue - a.finalValue : a.period < b.period ? 1 : -1))

    // Lista de colaboradores (para o filtro), sempre completa dentro da visibilidade.
    const colaboradores = [...new Map(all.map((r) => [r.sellerId, r.responsavel])).entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))

    const total = all.length
    const data = all.slice((page - 1) * perPage, (page - 1) * perPage + perPage)

    return NextResponse.json({
      success: true,
      data,
      colaboradores,
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
