// =============================================================================
// dashboard/attention.ts — central "Precisa da sua atenção" (servidor).
//
// Consolida o que está ATRASADO, CRÍTICO ou PARA HOJE em todos os módulos, sem
// tabela paralela: cada item é uma contagem real da tela de origem e leva
// direto à lista (drill-down). Só entra o que:
//   1. é do trabalho do perfil (relevância por cargo), e
//   2. o colaborador tem liberado (acesso efetivo: papel + exceções), e
//   3. está no escopo dele (próprio / unidade / loja) — sempre no servidor.
// Regras reaproveitadas: F&I (fi/dashboard), financeiro (alerts.computeAlerts),
// Operações (lists/overview), preparação (prep-core).
// =============================================================================

import type { DealStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { Module } from '@/lib/permissions'
import { getGoalPeriod } from '@/lib/goals/service'
import { buildDashboard as buildFiDashboard } from '@/lib/finance/fi/dashboard'
import { computeAlerts } from '@/lib/finance/alerts'
import { hasFinanceAccess } from '@/lib/finance/access'
import {
  NO_MATCH,
  scopedDealWhere,
  scopedFinanceProposalWhere,
  scopedLeadWhere,
  scopedPendencyWhere,
  type DashboardContext,
} from '@/lib/dashboard/context'
import {
  AGED_STOCK_DAYS,
  daysAgo,
  inStockVehicleWhere,
  operationWhere,
  overdueServiceWhere,
  serviceWhere,
  stalledTransferWhere,
  STALLED_TRANSFER_DAYS,
} from '@/lib/dashboard/sources'
import { CRM_MODULES } from '@/lib/dashboard/dashboardWidgets'
import {
  severityFromSla,
  summarizeAttention,
  type AttentionArea,
  type AttentionItem,
  type AttentionSummary,
} from '@/lib/dashboard/attention-core'
import type { DashboardRoleKind } from '@/lib/dashboard/types'

const OPEN_PENDENCIES = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'REATIVADA', 'VENCIDA'] as const
/** Sem SLA configurado, o lead novo vira atenção após este tempo. */
const DEFAULT_LEAD_SLA_MIN = 15

/** Áreas que fazem parte do trabalho de cada perfil. */
export const AREAS_BY_KIND: Record<DashboardRoleKind, AttentionArea[]> = {
  MASTER: [],
  ADMIN: ['comercial', 'crm', 'pendencias', 'financeiro', 'fi', 'documentacao', 'estoque', 'preparacao', 'publicacoes', 'posvenda'],
  GERENTE_GERAL: ['comercial', 'crm', 'pendencias', 'financeiro', 'fi', 'documentacao', 'estoque', 'preparacao', 'publicacoes', 'posvenda'],
  GERENTE: ['comercial', 'crm', 'pendencias', 'fi', 'documentacao', 'estoque', 'preparacao', 'posvenda'],
  VENDEDOR: ['comercial', 'crm', 'pendencias', 'fi', 'posvenda'],
  FINANCEIRO: ['financeiro', 'fi', 'pendencias', 'comercial'],
  FI: ['fi', 'pendencias', 'documentacao'],
  MARKETING: ['publicacoes', 'crm', 'pendencias'],
  SDR: ['crm', 'pendencias'],
  COMPRAS: ['estoque', 'preparacao', 'comercial', 'pendencias'],
  DOCUMENTACAO: ['documentacao', 'pendencias', 'posvenda'],
  PREPARACAO: ['preparacao', 'estoque', 'pendencias'],
  POS_VENDA: ['posvenda', 'pendencias', 'documentacao'],
  AUXILIAR: ['pendencias', 'documentacao', 'posvenda'],
  DEFAULT: ['pendencias'],
}

/** Quais áreas entram para ESTE colaborador (perfil ∩ acesso efetivo). */
export function attentionAreasFor(kind: DashboardRoleKind, can: (m: Module) => boolean): Set<AttentionArea> {
  const canAny = (ms: Module[]) => ms.some(can)
  const gate: Record<AttentionArea, boolean> = {
    comercial: canAny(['negotiations', 'negotiations.approve', 'stock.evaluate']),
    crm: canAny(CRM_MODULES),
    pendencias: can('pendencies'),
    financeiro: can('finance'),
    fi: can('financing'),
    documentacao: canAny(['ops.panel', 'ops.transfer.view', 'ops.renave.view', 'ops.fiscal.view']),
    estoque: can('stock.view'),
    preparacao: can('stock.view'),
    publicacoes: can('marketing.publications'),
    posvenda: can('negotiations'),
  }
  return new Set(AREAS_BY_KIND[kind].filter((area) => gate[area]))
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('{n}', String(n)))

type Push = (item: AttentionItem) => void

async function comercial(ctx: DashboardContext, push: Push) {
  const { access } = ctx
  const own = ctx.profile.scope === 'SELF'
  const jobs: Promise<void>[] = []

  if (access.can('negotiations.approve') && !own) {
    jobs.push(prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'] } }) }).then((n) => push({
      id: 'deal-aprovacao', area: 'comercial', severity: 'IMPORTANTE', bucket: 'HOJE', count: n,
      title: plural(n, '1 negociação aguarda sua aprovação', '{n} negociações aguardam sua aprovação'), href: '/negociacoes/aprovacoes',
    })))
    jobs.push(prisma.dealDiscountRequest.count({
      where: { status: 'PENDENTE', deal: scopedDealWhere(ctx) },
    }).then((n) => push({
      id: 'desconto-alcada', area: 'comercial', severity: 'IMPORTANTE', bucket: 'HOJE', count: n,
      title: plural(n, '1 desconto acima da alçada para decidir', '{n} descontos acima da alçada para decidir'), href: '/negociacoes/aprovacoes',
    })).catch(() => undefined))
  }
  if (access.can('stock.evaluate') && !own) {
    jobs.push(prisma.vehicleEvaluation.count({
      where: {
        ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
        ...(ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
        status: 'AGUARDANDO_APROVACAO',
      },
    }).then((n) => push({
      id: 'avaliacao-aprovacao', area: 'comercial', severity: 'ATENCAO', bucket: 'HOJE', count: n,
      title: plural(n, '1 avaliação de veículo aguarda decisão', '{n} avaliações de veículo aguardam decisão'), href: '/estoque/avaliacoes',
    })))
  }
  if (access.can('negotiations')) {
    // Negociações do vendedor devolvidas para correção / desaprovadas: ação dele.
    if (own) {
      jobs.push(prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: ['DEVOLVIDA_PARA_CORRECAO', 'DESAPROVADA'] as DealStatus[] } }) }).then((n) => push({
        id: 'deal-correcao', area: 'comercial', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: n,
        title: plural(n, '1 negociação voltou para correção', '{n} negociações voltaram para correção'),
        href: '/negociacoes?status=DEVOLVIDA_PARA_CORRECAO,DESAPROVADA',
      })))
    }
    if (ctx.profile.kind === 'FINANCEIRO' || ctx.profile.kind === 'ADMIN' || ctx.profile.kind === 'GERENTE_GERAL') {
      jobs.push(prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'AGUARDANDO_FINANCEIRO' }) }).then((n) => push({
        id: 'deal-financeiro', area: 'comercial', severity: 'ATENCAO', bucket: 'HOJE', count: n,
        title: plural(n, '1 venda aguarda conferência do financeiro', '{n} vendas aguardam conferência do financeiro'),
        href: '/negociacoes?status=AGUARDANDO_FINANCEIRO',
      })))
    }
  }
  await Promise.all(jobs)
}

async function crm(ctx: DashboardContext, push: Push, now: Date, todayStart: Date, todayEnd: Date) {
  const { access } = ctx
  const own = ctx.profile.scope === 'SELF' || ctx.profile.kind === 'SDR'
  const jobs: Promise<void>[] = []

  // Leads novos sem contato: severidade progressiva pelo tempo de espera do mais antigo.
  jobs.push(prisma.marketingLead.findMany({
    where: scopedLeadWhere(ctx, { status: { in: ['NEW', 'ASSIGNED'] }, lastContactAt: null, createdAt: { gte: daysAgo(30, now.getTime()) } }),
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 500,
  }).then((rows) => {
    if (!rows.length) return
    const oldest = now.getTime() - rows[0].createdAt.getTime()
    const severity = severityFromSla(oldest, DEFAULT_LEAD_SLA_MIN * 60_000)
    const late = rows.filter((r) => now.getTime() - r.createdAt.getTime() > DEFAULT_LEAD_SLA_MIN * 60_000).length
    push({
      id: 'lead-sem-contato', area: 'crm', severity: severity === 'INFO' ? 'ATENCAO' : severity,
      bucket: late > 0 ? 'ATRASADAS' : 'HOJE', count: rows.length,
      title: plural(rows.length, '1 lead novo ainda sem contato', '{n} leads novos ainda sem contato'),
      helper: late > 0 ? `${late} esperando há mais de ${DEFAULT_LEAD_SLA_MIN} min` : 'Responder rápido aumenta a conversão',
      href: own ? '/crm/leads' : '/marketing/sdr/inbox',
    })
  }))

  // Sem responsável (só quem distribui).
  if (!own && access.canAny(['marketing.leads.distribute', 'crm.lead.transfer', 'marketing.sdr.manage'])) {
    jobs.push(prisma.marketingLead.count({ where: scopedLeadWhere(ctx, { assignedToUserId: null, status: { in: ['NEW', 'RECYCLED'] } }) }).then((n) => push({
      id: 'lead-sem-responsavel', area: 'crm', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: n,
      title: plural(n, '1 lead sem responsável', '{n} leads sem responsável'), href: '/marketing/sdr/inbox',
    })))
  }

  // SLA estourado (régua do CRM).
  jobs.push(prisma.marketingLeadSla.count({
    where: {
      ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }),
      status: { in: ['PENDING', 'BREACHED', 'ESCALATED'] },
      deadline: { lt: now },
      lead: scopedLeadWhere(ctx, { status: { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] } }),
    },
  }).then((n) => push({
    id: 'lead-sla', area: 'crm', severity: 'CRITICO', bucket: 'CRITICAS', count: n,
    title: plural(n, '1 lead com prazo de atendimento estourado', '{n} leads com prazo de atendimento estourado'),
    href: own ? '/crm/leads' : '/marketing/sdr/inbox',
  })).catch(() => undefined))

  // Visitas de hoje (agenda).
  const visitWhere: Prisma.CrmLeadVisitWhereInput = {
    ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }),
    ...(ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
    ...(ctx.profile.scope === 'SELF' ? { hostUserId: ctx.user.id } : {}),
    ...(ctx.profile.kind === 'SDR' ? { createdByUserId: ctx.user.id } : {}),
  }
  jobs.push(prisma.crmLeadVisit.count({ where: { ...visitWhere, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] }, scheduledAt: { gte: todayStart, lte: todayEnd } } }).then((n) => push({
    id: 'visitas-hoje', area: 'crm', severity: 'INFO', bucket: 'HOJE', count: n,
    title: plural(n, '1 visita agendada para hoje', '{n} visitas agendadas para hoje'), href: '/crm/atendimentos',
  })))
  jobs.push(prisma.crmLeadVisit.count({ where: { ...visitWhere, status: { in: ['SCHEDULED', 'RESCHEDULED'] }, clientConfirmed: false, scheduledAt: { gte: now, lte: todayEnd } } }).then((n) => push({
    id: 'visitas-confirmar', area: 'crm', severity: 'ATENCAO', bucket: 'HOJE', count: n,
    title: plural(n, '1 visita de hoje sem confirmação do cliente', '{n} visitas de hoje sem confirmação do cliente'), href: '/crm/atendimentos',
  })))

  // Tarefas de follow-up vencidas (próprias).
  jobs.push(prisma.marketingLeadTask.count({
    where: {
      ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }),
      assignedToUserId: ctx.user.id,
      status: 'PENDING',
      dueAt: { lt: now },
    },
  }).then((n) => push({
    id: 'followup-atrasado', area: 'crm', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: n,
    title: plural(n, '1 retorno ao cliente atrasado', '{n} retornos a clientes atrasados'), href: '/crm/leads',
  })))

  await Promise.all(jobs)
}

async function pendencias(ctx: DashboardContext, push: Push, now: Date, todayStart: Date, todayEnd: Date) {
  const open = { status: { in: [...OPEN_PENDENCIES] } }
  const href = ctx.profile.scope === 'SELF' ? '/pendencias/minhas' : '/pendencias/central'
  const [criticas, vencidas, hoje] = await Promise.all([
    prisma.pendency.count({ where: scopedPendencyWhere(ctx, { ...open, OR: [{ priority: 'URGENTE' }, { severity: 'CRITICAL' }] }) }),
    prisma.pendency.count({
      where: scopedPendencyWhere(ctx, {
        status: { notIn: ['FINALIZADA', 'CANCELADA'] },
        OR: [{ status: 'VENCIDA' }, { dueDate: { lt: now } }, { slaDeadline: { lt: now } }],
      }),
    }),
    prisma.pendency.count({ where: scopedPendencyWhere(ctx, { ...open, dueDate: { gte: todayStart, lte: todayEnd } }) }),
  ])
  push({ id: 'pendencia-critica', area: 'pendencias', severity: 'CRITICO', bucket: 'CRITICAS', count: criticas, title: plural(criticas, '1 pendência crítica', '{n} pendências críticas'), href: `${href}${href.endsWith('central') ? '?priority=URGENTE' : ''}` })
  push({ id: 'pendencia-vencida', area: 'pendencias', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: vencidas, title: plural(vencidas, '1 pendência vencida', '{n} pendências vencidas'), href: `${href}${href.endsWith('central') ? '?slaVencida=true' : ''}` })
  push({ id: 'pendencia-hoje', area: 'pendencias', severity: 'ATENCAO', bucket: 'HOJE', count: hoje, title: plural(hoje, '1 pendência vence hoje', '{n} pendências vencem hoje'), href })
}

async function financeiro(ctx: DashboardContext, push: Push) {
  if (!ctx.tenantId) return
  // Mesma porta do Centro Financeiro (permissão + loja habilitada).
  if (!(await hasFinanceAccess(ctx.user).catch(() => false))) return
  const [alerts, approvals] = await Promise.all([
    computeAlerts(ctx.tenantId),
    prisma.financialApproval.count({ where: { tenantId: ctx.tenantId, status: 'PENDENTE', roles: { has: ctx.user.role } } }).catch(() => 0),
  ])
  push({ id: 'fin-pagar-vencido', area: 'financeiro', severity: 'CRITICO', bucket: 'CRITICAS', count: alerts.overduePay.count, amount: alerts.overduePay.total, title: plural(alerts.overduePay.count, '1 conta a pagar vencida', '{n} contas a pagar vencidas'), href: '/financeiro/pagar' })
  push({ id: 'fin-receber-vencido', area: 'financeiro', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: alerts.overdueReceive.count, amount: alerts.overdueReceive.total, title: plural(alerts.overdueReceive.count, '1 recebimento atrasado', '{n} recebimentos atrasados'), href: '/financeiro/receber' })
  push({ id: 'fin-pagar-hoje', area: 'financeiro', severity: 'ATENCAO', bucket: 'HOJE', count: alerts.dueToday.count, amount: alerts.dueToday.total, title: plural(alerts.dueToday.count, '1 conta vence hoje', '{n} contas vencem hoje'), href: '/financeiro/pagar' })
  push({ id: 'fin-transito', area: 'financeiro', severity: 'IMPORTANTE', bucket: 'AGUARDANDO_TERCEIROS', count: alerts.transitLate.count, amount: alerts.transitLate.total, title: plural(alerts.transitLate.count, '1 financiamento com crédito do banco atrasado', '{n} financiamentos com crédito do banco atrasado'), href: '/financiamento/aguardando-pagamento' })
  push({ id: 'fin-aprovacao', area: 'financeiro', severity: 'IMPORTANTE', bucket: 'HOJE', count: approvals, title: plural(approvals, '1 pagamento aguarda sua aprovação', '{n} pagamentos aguardam sua aprovação'), href: '/financeiro/aprovacoes' })
}

async function fi(ctx: DashboardContext, push: Push) {
  if (!ctx.tenantId) return
  // Reaproveita o "Precisa da sua atenção" do próprio F&I (mesma régua).
  const scope = scopedFinanceProposalWhere(ctx)
  const { attention, cards } = await buildFiDashboard(ctx.tenantId, scope)
  const severity: Record<string, AttentionItem['severity']> = { danger: 'IMPORTANTE', warning: 'ATENCAO', info: 'INFO' }
  for (const a of attention) {
    push({
      id: `fi-${a.key}`,
      area: 'fi',
      severity: severity[a.tone] ?? 'INFO',
      bucket: a.key === 'pagamento' || a.key === 'verificando' || a.key === 'banco-pediu' ? 'AGUARDANDO_TERCEIROS' : 'HOJE',
      count: a.count,
      title: a.label,
      href: a.href,
    })
  }
  if (cards.awaitingPayment.count > 0 && ctx.access.can('finance')) {
    push({
      id: 'fi-funding', area: 'fi', severity: 'INFO', bucket: 'AGUARDANDO_TERCEIROS', count: cards.awaitingPayment.count, amount: cards.awaitingPayment.amount,
      title: plural(cards.awaitingPayment.count, '1 contrato assinado aguardando o banco pagar', '{n} contratos assinados aguardando o banco pagar'),
      helper: 'Banco aprovou não é dinheiro na conta', href: '/financiamento/aguardando-pagamento',
    })
  }
}

async function documentacao(ctx: DashboardContext, push: Push, now: Date) {
  const [paradas, renave, notas] = await Promise.all([
    prisma.vehicleOperation.count({ where: stalledTransferWhere(ctx, now.getTime()) }),
    prisma.vehicleOperation.count({ where: operationWhere(ctx, { renaveStatus: { in: ['REJECTED', 'UNKNOWN'] } }) }),
    prisma.vehicleOperation.count({ where: operationWhere(ctx, { cancelledAt: null, fiscalStatus: 'REJECTED' }) }),
  ])
  push({ id: 'doc-transferencia-parada', area: 'documentacao', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: paradas, title: plural(paradas, `1 transferência parada há mais de ${STALLED_TRANSFER_DAYS} dias`, `{n} transferências paradas há mais de ${STALLED_TRANSFER_DAYS} dias`), href: '/operacoes/transferencias?aba=open' })
  push({ id: 'doc-renave', area: 'documentacao', severity: 'CRITICO', bucket: 'CRITICAS', count: renave, title: plural(renave, '1 registro no RENAVE com problema', '{n} registros no RENAVE com problema'), href: '/operacoes/renave?aba=issues' })
  push({ id: 'doc-nfe', area: 'documentacao', severity: 'CRITICO', bucket: 'CRITICAS', count: notas, title: plural(notas, '1 nota fiscal rejeitada', '{n} notas fiscais rejeitadas'), href: '/operacoes/notas' })
}

async function estoque(ctx: DashboardContext, push: Push, now: Date) {
  const [aged, semPreco] = await Promise.all([
    prisma.vehicle.count({ where: inStockVehicleWhere(ctx, { entryDate: { lt: daysAgo(AGED_STOCK_DAYS, now.getTime()) } }) }),
    prisma.vehicle.count({ where: inStockVehicleWhere(ctx, { stockStatus: { in: ['DISPONIVEL', 'EM_PROMOCAO'] }, OR: [{ salePrice: null }, { salePrice: { lte: 0 } }] }) }),
  ])
  push({ id: 'estoque-90', area: 'estoque', severity: 'ATENCAO', bucket: 'PROXIMAS', count: aged, title: plural(aged, `1 veículo há mais de ${AGED_STOCK_DAYS} dias em estoque`, `{n} veículos há mais de ${AGED_STOCK_DAYS} dias em estoque`), href: '/relatorios/estoque/parados' })
  push({ id: 'estoque-sem-preco', area: 'estoque', severity: 'IMPORTANTE', bucket: 'HOJE', count: semPreco, title: plural(semPreco, '1 veículo disponível sem preço de venda', '{n} veículos disponíveis sem preço de venda'), href: '/estoque' })
}

async function preparacao(ctx: DashboardContext, push: Push, now: Date, todayEnd: Date) {
  const [atrasados, hoje] = await Promise.all([
    prisma.vehicleService.count({ where: overdueServiceWhere(ctx, now) }),
    prisma.vehicleService.count({ where: serviceWhere(ctx, { status: { in: ['AGUARDANDO', 'EM_SERVICO'] }, dueAt: { gte: now, lte: todayEnd } }) }),
  ])
  push({ id: 'prep-atrasado', area: 'preparacao', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: atrasados, title: plural(atrasados, '1 serviço de preparação atrasado', '{n} serviços de preparação atrasados'), href: '/relatorios/estoque/preparacao' })
  push({ id: 'prep-hoje', area: 'preparacao', severity: 'INFO', bucket: 'HOJE', count: hoje, title: plural(hoje, '1 serviço previsto para hoje', '{n} serviços previstos para hoje'), href: '/relatorios/estoque/preparacao' })
}

async function publicacoes(ctx: DashboardContext, push: Push) {
  const tenantPart = ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }
  const unitPart = ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}
  const [problemas, vendidoNoAr, conexoes] = await Promise.all([
    prisma.publication.count({ where: { ...tenantPart, ...unitPart, archivedAt: null, status: { in: ['FALHA', 'REJEITADO', 'ACAO_MANUAL'] } } }),
    // Carro vendido ainda anunciado: risco real de atender cliente por carro que não existe.
    prisma.publication.count({ where: { ...tenantPart, ...unitPart, archivedAt: null, status: { in: ['PUBLICADO', 'ATUALIZACAO_PENDENTE', 'EM_ANALISE'] }, vehicle: { stockStatus: 'VENDIDO' } } }),
    prisma.publicationConnection.count({ where: { ...tenantPart, status: { in: ['RECONECTAR', 'PENDENCIA'] } } }),
  ]).catch(() => [0, 0, 0] as const)
  push({ id: 'pub-vendido', area: 'publicacoes', severity: 'CRITICO', bucket: 'CRITICAS', count: vendidoNoAr, title: plural(vendidoNoAr, '1 veículo vendido ainda anunciado', '{n} veículos vendidos ainda anunciados'), href: '/marketing/publicacoes/lista?status=PUBLICADO' })
  push({ id: 'pub-erro', area: 'publicacoes', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: problemas, title: plural(problemas, '1 anúncio com problema', '{n} anúncios com problema'), href: '/marketing/publicacoes/lista?status=FALHA' })
  push({ id: 'pub-conexao', area: 'publicacoes', severity: 'IMPORTANTE', bucket: 'HOJE', count: conexoes, title: plural(conexoes, '1 canal precisa ser reconectado', '{n} canais precisam ser reconectados'), href: '/marketing/canais' })
}

async function posvenda(ctx: DashboardContext, push: Push, todayStart: Date, todayEnd: Date) {
  const waiting = { status: 'AGUARDANDO_ENTREGA' as DealStatus }
  const [atrasadas, hoje] = await Promise.all([
    prisma.deal.count({ where: scopedDealWhere(ctx, { ...waiting, deliveryDate: { lt: todayStart } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { ...waiting, deliveryDate: { gte: todayStart, lte: todayEnd } }) }),
  ])
  push({ id: 'entrega-atrasada', area: 'posvenda', severity: 'IMPORTANTE', bucket: 'ATRASADAS', count: atrasadas, title: plural(atrasadas, '1 entrega de veículo atrasada', '{n} entregas de veículo atrasadas'), href: '/negociacoes?status=AGUARDANDO_ENTREGA' })
  push({ id: 'entrega-hoje', area: 'posvenda', severity: 'INFO', bucket: 'HOJE', count: hoje, title: plural(hoje, '1 entrega prevista para hoje', '{n} entregas previstas para hoje'), href: '/negociacoes?status=AGUARDANDO_ENTREGA' })
}

export interface AttentionResult extends AttentionSummary {
  areas: AttentionArea[]
  /** Áreas que falharam ao carregar (o resto continua aparecendo). */
  failedAreas: AttentionArea[]
}

export async function buildAttention(ctx: DashboardContext, now = new Date()): Promise<AttentionResult> {
  const areas = attentionAreasFor(ctx.profile.kind, ctx.access.can)
  const { startsAt: todayStart, endsAt: todayEnd } = getGoalPeriod({ frequency: 'daily', referenceDate: now })
  const items: AttentionItem[] = []
  const push: Push = (item) => { if (item.count > 0) items.push(item) }

  const loaders: Partial<Record<AttentionArea, () => Promise<void>>> = {
    comercial: () => comercial(ctx, push),
    crm: () => crm(ctx, push, now, todayStart, todayEnd),
    pendencias: () => pendencias(ctx, push, now, todayStart, todayEnd),
    financeiro: () => financeiro(ctx, push),
    fi: () => fi(ctx, push),
    documentacao: () => documentacao(ctx, push, now),
    estoque: () => estoque(ctx, push, now),
    preparacao: () => preparacao(ctx, push, now, todayEnd),
    publicacoes: () => publicacoes(ctx, push),
    posvenda: () => posvenda(ctx, push, todayStart, todayEnd),
  }

  const active = [...areas]
  const results = await Promise.allSettled(active.map((area) => loaders[area]!()))
  const failedAreas = active.filter((_, i) => results[i].status === 'rejected')
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[dashboard/attention] área ${active[i]} falhou:`, r.reason)
  })

  return { ...summarizeAttention(items), areas: active, failedAreas }
}
