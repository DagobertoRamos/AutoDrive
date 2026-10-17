// =============================================================================
// dashboard/insights.ts — SLA e tempo entre etapas (gargalos), SÓ com dado real.
//
// Cada medida compara o período atual com o anterior de mesmo tamanho. Sem
// amostra mínima, a medida volta como "dados insuficientes" — nunca inventa.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { DashboardContext } from '@/lib/dashboard/context'
import { NO_MATCH, scopedLeadWhere } from '@/lib/dashboard/context'
import { serviceWhere } from '@/lib/dashboard/sources'
import { buildInsight, type Insight, type InsightSample } from '@/lib/dashboard/insights-core'

const DAY = 86_400_000
const WINDOW_DAYS = 30
const MIN_REAL_SERVICE_DAYS = 15 / (24 * 60)

interface Window { start: Date; end: Date }

function windows(now = new Date()): { current: Window; previous: Window } {
  const end = now
  const start = new Date(end.getTime() - WINDOW_DAYS * DAY)
  const prevEnd = start
  const prevStart = new Date(prevEnd.getTime() - WINDOW_DAYS * DAY)
  return { current: { start, end }, previous: { start: prevStart, end: prevEnd } }
}

const tenantPart = (ctx: DashboardContext) => (ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH })

/**
 * Primeiro contato de cada lead = o que vier antes entre a 1ª interação de
 * contato registrada (ligação, WhatsApp, e-mail) e a resposta à atribuição.
 * Devolve minutos desde a chegada do lead. Lead sem contato não entra na média
 * (aparece como "sem contato" na central de atenção).
 */
export async function firstContactMinutes(
  tenantId: string | null,
  leads: Array<{ id: string; createdAt: Date; assignedToUserId?: string | null }>,
): Promise<Array<{ leadId: string; userId: string | null; minutes: number }>> {
  if (!leads.length) return []
  const ids = leads.map((l) => l.id)
  const tenantFilter = tenantId ? { tenantId } : {}
  const [interactions, assignments] = await Promise.all([
    prisma.crmLeadInteraction.groupBy({
      by: ['leadId'],
      where: { ...tenantFilter, leadId: { in: ids }, type: { in: ['CALL', 'WHATSAPP', 'EMAIL'] } },
      _min: { occurredAt: true },
    }),
    prisma.marketingLeadAssignment.groupBy({
      by: ['leadId'],
      where: { ...tenantFilter, leadId: { in: ids }, respondedAt: { not: null } },
      _min: { respondedAt: true },
    }),
  ])
  const first = new Map<string, number>()
  const keep = (leadId: string, at: Date | null | undefined) => {
    if (!at) return
    const prev = first.get(leadId)
    if (prev == null || at.getTime() < prev) first.set(leadId, at.getTime())
  }
  for (const r of interactions) keep(r.leadId, r._min.occurredAt)
  for (const r of assignments) keep(r.leadId, r._min.respondedAt)
  return leads.flatMap((l) => {
    const at = first.get(l.id)
    if (at == null) return []
    const minutes = (at - l.createdAt.getTime()) / 60_000
    return minutes >= 0 ? [{ leadId: l.id, userId: l.assignedToUserId ?? null, minutes }] : []
  })
}

/** Lead recebido → primeiro contato, em minutos (escopo do colaborador). */
async function leadResponseSample(ctx: DashboardContext, w: Window): Promise<InsightSample> {
  const leads = await prisma.marketingLead.findMany({
    where: scopedLeadWhere(ctx, { createdAt: { gte: w.start, lt: w.end } }),
    select: { id: true, createdAt: true },
    take: 2000,
  })
  const rows = await firstContactMinutes(ctx.user.role === 'MASTER' ? null : ctx.tenantId, leads)
  return rows.map((r) => r.minutes)
}

/** Serviço de preparação: entrada no prestador → concluído, em dias. */
async function prepCycleSample(ctx: DashboardContext, w: Window): Promise<InsightSample> {
  const rows = await prisma.vehicleService.findMany({
    where: serviceWhere(ctx, { status: 'CONCLUIDO', finishedAt: { gte: w.start, lt: w.end } }),
    select: { sentAt: true, createdAt: true, finishedAt: true },
    take: 2000,
  })
  return rows
    .map((r) => (r.finishedAt!.getTime() - (r.sentAt ?? r.createdAt).getTime()) / DAY)
    // < 15 min = serviço lançado já concluído (registro tardio), não é tempo real de preparação.
    .filter((v) => v >= MIN_REAL_SERVICE_DAYS)
}

/** Contrato assinado → dinheiro do banco na conta (funding), em dias. */
async function fundingSample(ctx: DashboardContext, w: Window): Promise<InsightSample> {
  const rows = await prisma.financeProposal.findMany({
    where: {
      ...tenantPart(ctx),
      fundedAt: { gte: w.start, lt: w.end },
      contractSignedAt: { not: null },
      ...(ctx.profile.scope === 'UNIT' ? { deal: { unitId: ctx.unitId ?? NO_MATCH } } : {}),
    },
    select: { contractSignedAt: true, fundedAt: true },
    take: 2000,
  })
  return rows.map((r) => (r.fundedAt!.getTime() - r.contractSignedAt!.getTime()) / DAY).filter((v) => v >= 0)
}

/** Lead → visita realizada: taxa de comparecimento das visitas do período. */
async function visitShowSample(ctx: DashboardContext, w: Window): Promise<{ done: number; noShow: number }> {
  const where = {
    ...tenantPart(ctx),
    scheduledAt: { gte: w.start, lt: w.end },
    ...(ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
    ...(ctx.profile.scope === 'SELF' ? { hostUserId: ctx.user.id } : {}),
  }
  const [done, noShow] = await Promise.all([
    prisma.crmLeadVisit.count({ where: { ...where, status: 'COMPLETED' } }),
    prisma.crmLeadVisit.count({ where: { ...where, status: 'NO_SHOW' } }),
  ])
  return { done, noShow }
}

export async function leadFirstResponseMinutes(ctx: DashboardContext): Promise<Insight> {
  const { current, previous } = windows()
  const [cur, prev] = await Promise.all([leadResponseSample(ctx, current), leadResponseSample(ctx, previous)])
  return buildInsight({
    id: 'lead-resposta',
    label: 'Tempo até o primeiro contato com o lead',
    unit: 'min',
    current: cur,
    previous: prev,
    href: '/crm/leads',
  })
}

/**
 * Gargalos do período, conforme o que o colaborador pode ver. Cada medida
 * custa 2 consultas indexadas (período atual + anterior), sem N+1.
 */
export async function computeInsights(ctx: DashboardContext): Promise<Insight[]> {
  const { access } = ctx
  const { current, previous } = windows()
  const jobs: Array<Promise<Insight | null>> = []

  if (access.canAny(['crm', 'crm.view.own', 'crm.view.unit', 'crm.view.all', 'marketing.sdr'])) {
    jobs.push(leadFirstResponseMinutes(ctx))
    jobs.push(Promise.all([visitShowSample(ctx, current), visitShowSample(ctx, previous)]).then(([c, p]) => {
      const total = c.done + c.noShow
      const prevTotal = p.done + p.noShow
      return buildInsight({
        id: 'visita-comparecimento',
        label: 'Comparecimento nas visitas agendadas',
        unit: '%',
        current: total > 0 ? Array.from({ length: total }, (_, i) => (i < c.done ? 100 : 0)) : [],
        previous: prevTotal > 0 ? Array.from({ length: prevTotal }, (_, i) => (i < p.done ? 100 : 0)) : [],
        higherIsBetter: true,
        href: '/crm/atendimentos',
      })
    }))
  }
  if (access.can('stock.view') && ctx.profile.scope !== 'SELF') {
    jobs.push(Promise.all([prepCycleSample(ctx, current), prepCycleSample(ctx, previous)]).then(([c, p]) => buildInsight({
      id: 'preparacao-ciclo',
      label: 'Tempo médio de um serviço de preparação',
      unit: 'dias',
      current: c,
      previous: p,
      href: '/relatorios/estoque/preparacao',
    })))
  }
  if (access.can('financing') && ctx.profile.scope !== 'SELF') {
    jobs.push(Promise.all([fundingSample(ctx, current), fundingSample(ctx, previous)]).then(([c, p]) => buildInsight({
      id: 'funding-prazo',
      label: 'Contrato assinado até o banco pagar',
      unit: 'dias',
      current: c,
      previous: p,
      href: '/financiamento/aguardando-pagamento',
    })))
  }

  const settled = await Promise.allSettled(jobs)
  return settled
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((v): v is Insight => Boolean(v))
}
