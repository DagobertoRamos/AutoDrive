// =============================================================================
// dashboard/team.ts — "Quem precisa de ajuda" (vendedor líder / gerência).
//
// Sinais objetivos por vendedor, apresentados como OPORTUNIDADE DE COACHING —
// nunca como punição. Sem dado financeiro de colegas (comissão, salário).
// Tudo em agregações (groupBy), sem consulta por vendedor (sem N+1).
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { commissionEligibleDealWindowWhere } from '@/lib/commission/status'
import { getGoalPeriod } from '@/lib/goals/service'
import { NO_MATCH, type DashboardContext } from '@/lib/dashboard/context'
import { daysAgo } from '@/lib/dashboard/sources'
import { coachingSignals, type TeamMemberStats } from '@/lib/dashboard/team-core'
import { firstContactMinutes } from '@/lib/dashboard/insights'

export interface TeamCoachingRow {
  userId: string
  name: string
  signals: string[]
  stats: TeamMemberStats
}

const LEADERS = new Set(['VENDEDOR_LIDER', 'GERENTE', 'GERENTE_GERAL', 'ADM', 'GERENTE_ADMINISTRATIVO'])

export function canSeeTeamCoaching(ctx: DashboardContext): boolean {
  if (!LEADERS.has(ctx.user.role) || !ctx.tenantId) return false
  return ctx.access.canAny(['crm.view.unit', 'crm.view.all', 'sellerQueue.lead', 'sellerQueue.manage', 'pendencies.manage'])
}

export async function computeTeamCoaching(ctx: DashboardContext): Promise<TeamCoachingRow[]> {
  if (!canSeeTeamCoaching(ctx)) return []
  const tenantId = ctx.tenantId!
  // Líder e gerente olham a própria unidade; gestão da loja olha a loja toda.
  const unitScoped = ctx.user.role === 'VENDEDOR_LIDER' || ctx.user.role === 'GERENTE' || ctx.profile.scope !== 'TENANT'
  const sellers = await prisma.seller.findMany({
    where: {
      active: true,
      unit: { tenantId },
      ...(unitScoped ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
      userId: { not: ctx.user.id },
    },
    select: { id: true, userId: true, fullName: true, shortName: true },
    take: 60,
  })
  if (!sellers.length) return []

  const userIds = sellers.map((s) => s.userId)
  const sellerIds = sellers.map((s) => s.id)
  const now = Date.now()
  const since = daysAgo(30, now)
  const month = getGoalPeriod({ frequency: 'monthly', referenceDate: new Date(now) })
  const leadBase: Prisma.MarketingLeadWhereInput = { tenantId, deletedAt: null, assignedToUserId: { in: userIds } }

  const [openLeads, noContact, assignments, visits, sales] = await Promise.all([
    prisma.marketingLead.groupBy({ by: ['assignedToUserId'], where: { ...leadBase, status: { in: ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED'] } }, _count: { _all: true } }),
    prisma.marketingLead.groupBy({ by: ['assignedToUserId'], where: { ...leadBase, status: { in: ['NEW', 'ASSIGNED'] }, lastContactAt: null }, _count: { _all: true } }),
    prisma.marketingLead.findMany({
      where: { ...leadBase, createdAt: { gte: since } },
      select: { id: true, createdAt: true, assignedToUserId: true },
      take: 3000,
    }).then((leads) => firstContactMinutes(tenantId, leads)),
    prisma.crmLeadVisit.groupBy({ by: ['hostUserId'], where: { tenantId, hostUserId: { in: userIds }, status: 'COMPLETED', scheduledAt: { gte: since } }, _count: { _all: true } }),
    prisma.deal.groupBy({
      by: ['sellerId'],
      where: { tenantId, sellerId: { in: sellerIds }, type: { in: ['VENDA', 'TROCA'] }, ...(commissionEligibleDealWindowWhere({ start: month.startsAt, end: month.endsAt }) as Prisma.DealWhereInput) },
      _count: { _all: true },
    }),
  ])

  const countBy = <K extends string>(rows: Array<Record<K, string | null> & { _count: { _all: number } }>, key: K) =>
    new Map(rows.map((r) => [r[key] as string, r._count._all]))
  const open = countBy(openLeads, 'assignedToUserId')
  const nc = countBy(noContact, 'assignedToUserId')
  const vis = countBy(visits, 'hostUserId')
  const sold = countBy(sales, 'sellerId')
  const resp = new Map<string, number[]>()
  for (const a of assignments) {
    if (!a.userId) continue
    const list = resp.get(a.userId) ?? []
    list.push(a.minutes)
    resp.set(a.userId, list)
  }

  return sellers
    .map((s) => {
      const r = resp.get(s.userId) ?? []
      const stats: TeamMemberStats = {
        openLeads: open.get(s.userId) ?? 0,
        leadsWithoutContact: nc.get(s.userId) ?? 0,
        avgResponseMin: r.length ? r.reduce((x, y) => x + y, 0) / r.length : null,
        responseSample: r.length,
        visits30d: vis.get(s.userId) ?? 0,
        salesMonth: sold.get(s.id) ?? 0,
      }
      return { userId: s.userId, name: s.shortName || s.fullName, stats, signals: coachingSignals(stats) }
    })
    .filter((row) => row.signals.length > 0)
    .sort((a, b) => b.signals.length - a.signals.length || b.stats.leadsWithoutContact - a.stats.leadsWithoutContact)
    .slice(0, 6)
}
