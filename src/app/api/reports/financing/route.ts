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
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
