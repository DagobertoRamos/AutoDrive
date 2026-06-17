// =============================================================================
// /api/reports/financing — relatórios do módulo Financiamento (read-only).
// Sobre FinanceProposal. Multi-tenant via tenantWhere; gated 'financing'.
// Retorna: summary (KPIs), byStatus, byBank.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { num } from '@/lib/finance/finance-service'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const extra: Record<string, unknown> = {}
    if (from || to) extra.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}) }
    const where = tenantWhere(user.role, tenantId, extra)

    const [byStatusRaw, byBankRaw, banks] = await Promise.all([
      prisma.financeProposal.groupBy({ by: ['status'], where: where as never, _count: { _all: true }, _sum: { amountRequested: true, approvedValue: true } }),
      prisma.financeProposal.groupBy({ by: ['bankId'], where: where as never, _count: { _all: true }, _sum: { approvedValue: true } }),
      prisma.financeBank.findMany({ where: tenantWhere(user.role, tenantId, {}) as never, select: { id: true, name: true } }),
    ])

    const bankMap = Object.fromEntries(banks.map((b) => [b.id, b.name]))
    const byStatus = byStatusRaw.map((g) => ({ status: g.status, count: g._count._all, solicitado: num(g._sum.amountRequested), aprovado: num(g._sum.approvedValue) }))
    const get = (s: string) => byStatus.find((x) => x.status === s)?.count ?? 0
    const aprovadas = get('APROVADA'), recusadas = get('RECUSADA')
    const total = byStatus.reduce((s, x) => s + x.count, 0)
    const valorAprovado = byStatus.find((x) => x.status === 'APROVADA')?.aprovado ?? 0

    const byBank = byBankRaw
      .map((g) => ({ banco: g.bankId ? (bankMap[g.bankId] ?? '—') : 'Sem banco', count: g._count._all, aprovado: num(g._sum.approvedValue) }))
      .sort((a, b) => b.count - a.count)

    // ── BI avançado (Fase 9) ──────────────────────────────────────────────────
    const canSeeReturn = canAccessModule(user.role, 'financing.config')
    const range = (field: string) => (from || to ? { [field]: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}) } } : {})
    const subWhere = tenantWhere(user.role, tenantId, range('submittedAt'))
    const simWhere = tenantWhere(user.role, tenantId, range('createdAt'))

    const [simCount, bySellerRaw, bySubRaw, pendingDocsRaw, marginAgg] = await Promise.all([
      prisma.financeSimulation.count({ where: simWhere as never }),
      prisma.financeProposal.groupBy({ by: ['sellerId', 'status'], where: where as never, _count: { _all: true }, _sum: { approvedValue: true } }),
      prisma.financeProposalSubmission.groupBy({ by: ['bankId', 'status'], where: subWhere as never, _count: { _all: true } }),
      prisma.financeProposalDocument.groupBy({ by: ['proposalId'], where: tenantWhere(user.role, tenantId, { required: true, status: { not: 'APROVADO' } }) as never, _count: { _all: true } }),
      canSeeReturn ? prisma.financeSimulationOption.aggregate({ where: { simulation: { is: simWhere as never } }, _sum: { estimatedReturn: true } }) : Promise.resolve(null),
    ])

    // Funil: simulações comparativas → fichas → enviadas → aprovadas.
    const funnel = {
      simulacoes: simCount,
      fichas: total,
      enviadas: get('ENVIADA') + aprovadas + recusadas, // tudo que saiu de simulação
      aprovadas,
    }

    // Por vendedor (produção). sellerId é User.id (string livre).
    const sellerAgg = new Map<string, { total: number; aprovadas: number; valorAprovado: number }>()
    for (const g of bySellerRaw) {
      const key = g.sellerId ?? '—'
      const cur = sellerAgg.get(key) ?? { total: 0, aprovadas: 0, valorAprovado: 0 }
      cur.total += g._count._all
      if (g.status === 'APROVADA') { cur.aprovadas += g._count._all; cur.valorAprovado += num(g._sum.approvedValue) }
      sellerAgg.set(key, cur)
    }
    const sellerIds = [...sellerAgg.keys()].filter((k) => k !== '—')
    const sellers = sellerIds.length ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } }) : []
    const sellerNames = Object.fromEntries(sellers.map((s) => [s.id, s.name]))
    const bySeller = [...sellerAgg.entries()]
      .map(([id, v]) => ({ vendedor: id === '—' ? 'Sem vendedor' : (sellerNames[id] ?? '—'), ...v }))
      .sort((a, b) => b.total - a.total)

    // Envios por banco (submissões), com aprovações.
    const subAgg = new Map<string, { enviados: number; aprovados: number }>()
    for (const g of bySubRaw) {
      const key = g.bankId ?? '—'
      const cur = subAgg.get(key) ?? { enviados: 0, aprovados: 0 }
      cur.enviados += g._count._all
      if (g.status === 'APROVADA') cur.aprovados += g._count._all
      subAgg.set(key, cur)
    }
    const bySubmissionBank = [...subAgg.entries()]
      .map(([id, v]) => ({ banco: id === '—' ? 'Sem banco' : (bankMap[id] ?? '—'), ...v }))
      .sort((a, b) => b.enviados - a.enviados)

    const pendingDocsProposals = pendingDocsRaw.length
    const margin = canSeeReturn ? { retornoEstimado: num(marginAgg?._sum.estimatedReturn), valorAprovado } : null

    return NextResponse.json({
      success: true,
      summary: {
        total,
        simulacoes: get('SIMULACAO'),
        enviadas: get('ENVIADA'),
        aprovadas,
        recusadas,
        canceladas: get('CANCELADA'),
        taxaAprovacao: (aprovadas + recusadas) > 0 ? Math.round((aprovadas / (aprovadas + recusadas)) * 100) : 0,
        valorAprovado,
      },
      byStatus,
      byBank,
      // ── Fase 9 — BI avançado ──
      canSeeReturn,
      funnel,
      bySeller,
      bySubmissionBank,
      pendingDocsProposals,
      margin,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
