import type {
  DealStatus,
  FinanceProposalStatus,
  PendencyStatus,
  Prisma,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/lib/auth-guards'
import { aggregateAchieved } from '@/lib/goals/aggregators'
import { computeRanking } from '@/lib/ranking/service'
import { getGoalPeriod } from '@/lib/goals/service'
import { num } from '@/lib/finance/finance-service'
import { commissionEligibleDealWindowWhere } from '@/lib/commission/status'
import {
  filterDashboardMetrics,
  filterDashboardSection,
  filterDashboardSections,
  applyAccessToLoadPlan,
  resolveDashboardDataLoadPlan,
} from '@/lib/dashboard/dashboardWidgets'
import type {
  DashboardListItem,
  DashboardMetric,
  DashboardProfile,
  DashboardSection,
  DashboardSummary,
} from '@/lib/dashboard/types'
import type { TenantServiceKey } from '@/lib/tenant-services/types'
import {
  NO_MATCH,
  aggregationScope,
  resolveDashboardContext,
  scopedDealWhere,
  scopedFinanceProposalWhere,
  scopedFinancialWhere,
  scopedLeadWhere,
  scopedPendencyWhere,
  type DashboardContext,
} from '@/lib/dashboard/context'
import {
  AGED_STOCK_DAYS,
  AVAILABLE_STOCK_STATUSES,
  NEGOTIATION_STOCK_STATUSES,
  OPEN_SERVICE_STATUSES,
  PREP_STOCK_STATUSES,
  STALLED_TRANSFER_DAYS,
  daysAgo,
  inStockVehicleWhere,
  openTransferWhere,
  operationWhere,
  overdueServiceWhere,
  serviceWhere,
  stalledTransferWhere,
} from '@/lib/dashboard/sources'
import { financeCan } from '@/lib/finance/access'
import { leadFirstResponseMinutes } from '@/lib/dashboard/insights'
import { formatInsightValue } from '@/lib/dashboard/insights-core'

const LOST_DEALS: DealStatus[] = ['CANCELADA', 'RECUSADA', 'DESAPROVADA', 'FINANCEIRO_REPROVADO']
const OPEN_DEALS: DealStatus[] = [
  'RASCUNHO',
  'EM_PREENCHIMENTO',
  'EM_ANDAMENTO',
  'AGUARDANDO_LIBERACAO',
  'AGUARDANDO_APROVACAO',
  'AGUARDANDO_SINAL',
  'SINAL_RECEBIDO',
  'RESERVADA',
  'AGUARDANDO_FINANCEIRO',
  'AGUARDANDO_DOCUMENTACAO',
  'AGUARDANDO_CONTRATO',
  'CONTRATO_GERADO',
  'AGUARDANDO_ASSINATURA',
  'AGUARDANDO_ENTREGA',
  'REABERTA',
  'BLOQUEADA',
]
const OPEN_PENDENCIES: PendencyStatus[] = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'REATIVADA', 'VENCIDA']
const CLOSED_PENDENCIES: PendencyStatus[] = ['FINALIZADA', 'CANCELADA']
const PENDING_FINANCE: FinanceProposalStatus[] = ['SIMULACAO', 'ENVIADA']


interface RawDashboardMetrics {
  commercial: {
    vendasTrocas: number
    compras: number
    consignacoes: number
    propostasAbertas: number
    propostasAprovadas: number
    propostasPerdidas: number
    aguardandoAprovacao: number
    aguardandoFinanceiro: number
    aguardandoDocumentacao: number
    retornos: number
    garantias: number
    servicos: number
    valorVendido: number
  }
  pendencies: {
    abertas: number
    minhas: number
    atribuidas: number
    vencidas: number
    vencendoHoje: number
    criticas: number
    aguardandoGerente: number
    financeiras: number
    documentacao: number
    porResponsavel: DashboardListItem[]
  }
  goals: {
    minhas: number
    unidade: number
    tenant: number
  }
  ranking: {
    unitTop: DashboardListItem[]
    tenantTop: DashboardListItem[]
    myUnitRank: number | null
    myTenantRank: number | null
  }
  leads: {
    total: number
    novos: number
    semAtendimento: number
    emAtendimento: number
    perdidos: number
    convertidos: number
    meus: number
    porOrigem: DashboardListItem[]
    visitasHoje: number
    noShowMes: number
    contatosMes: number
    /** Média lead → primeiro contato (min); null = dados insuficientes. */
    tempoRespostaMin: number | null
    veiculoMaisProcurado: string | null
  }
  financing: {
    total: number
    simulacoes: number
    enviadas: number
    aprovadas: number
    recusadas: number
    pendentes: number
    docsPendentes: number
    produtos: number
    porBanco: DashboardListItem[]
    retornoEstimado: number | null
  }
  finance: {
    receitas: number
    despesas: number
    aReceber: number
    aPagar: number
    pagamentosPendentes: number
    recebimentosPendentes: number
    comissoesPendentes: number
    comissoesPagas: number
  } | null
  purchases: {
    avaliados: number
    emAndamento: number
    aprovados: number
    pendentes: number
    comprados: number
    trocas: number
    estoquePrevisto: number
    aguardandoDocumentacao: number
  }
  documents: {
    pendentes: number
    contratos: number
    assinaturas: number
    entregas: number
    vistorias: number
    transferencias: number
  }
  system: {
    usuariosAtivos: number
    unidades: number
    pendenciasCriticas: number
    alertasSistema: number
  }
  units: DashboardListItem[]
  stock: {
    total: number
    proprio: number
    consignado: number
    parceiro: number
    emPreparacao: number
    emNegociacao: number
    disponiveis: number
    publicados: number | null
    aging: { ate30: number; de31a60: number; de61a90: number; acima90: number }
    valorVenda: number
    /** Custo de aquisição — só para quem pode ver custo (null = sem permissão). */
    valorImobilizado: number | null
  }
  prep: {
    servicosAbertos: number
    aguardando: number
    emServico: number
    atrasados: number
    previstosHoje: number
    concluidosMes: number
    custoPrevistoAberto: number | null
    custoRealizadoMes: number | null
  }
  ops: {
    transferenciasAbertas: number
    transferenciasParadas: number
    renaveSaidaPendente: number
    renaveProblemas: number
    notasPendentes: number
    notasRejeitadas: number
    restricoesAtivas: number
    vendas90d: number
  }
  deliveries: {
    aguardandoEntrega: number
    entregasAtrasadas: number
    entregasHoje: number
    entreguesMes: number
    posVendaAtivos: number
  }
}

function emptyRawDashboardMetrics(): RawDashboardMetrics {
  return {
    commercial: {
      vendasTrocas: 0,
      compras: 0,
      consignacoes: 0,
      propostasAbertas: 0,
      propostasAprovadas: 0,
      propostasPerdidas: 0,
      aguardandoAprovacao: 0,
      aguardandoFinanceiro: 0,
      aguardandoDocumentacao: 0,
      retornos: 0,
      garantias: 0,
      servicos: 0,
      valorVendido: 0,
    },
    pendencies: {
      abertas: 0,
      minhas: 0,
      atribuidas: 0,
      vencidas: 0,
      vencendoHoje: 0,
      criticas: 0,
      aguardandoGerente: 0,
      financeiras: 0,
      documentacao: 0,
      porResponsavel: [],
    },
    goals: {
      minhas: 0,
      unidade: 0,
      tenant: 0,
    },
    ranking: {
      unitTop: [],
      tenantTop: [],
      myUnitRank: null,
      myTenantRank: null,
    },
    leads: {
      total: 0,
      novos: 0,
      semAtendimento: 0,
      emAtendimento: 0,
      perdidos: 0,
      convertidos: 0,
      meus: 0,
      porOrigem: [],
      visitasHoje: 0,
      noShowMes: 0,
      contatosMes: 0,
      tempoRespostaMin: null,
      veiculoMaisProcurado: null,
    },
    financing: {
      total: 0,
      simulacoes: 0,
      enviadas: 0,
      aprovadas: 0,
      recusadas: 0,
      pendentes: 0,
      docsPendentes: 0,
      produtos: 0,
      porBanco: [],
      retornoEstimado: null,
    },
    finance: null,
    purchases: {
      avaliados: 0,
      emAndamento: 0,
      aprovados: 0,
      pendentes: 0,
      comprados: 0,
      trocas: 0,
      estoquePrevisto: 0,
      aguardandoDocumentacao: 0,
    },
    documents: {
      pendentes: 0,
      contratos: 0,
      assinaturas: 0,
      entregas: 0,
      vistorias: 0,
      transferencias: 0,
    },
    system: {
      usuariosAtivos: 0,
      unidades: 0,
      pendenciasCriticas: 0,
      alertasSistema: 0,
    },
    units: [],
    stock: {
      total: 0,
      proprio: 0,
      consignado: 0,
      parceiro: 0,
      emPreparacao: 0,
      emNegociacao: 0,
      disponiveis: 0,
      publicados: null,
      aging: { ate30: 0, de31a60: 0, de61a90: 0, acima90: 0 },
      valorVenda: 0,
      valorImobilizado: null,
    },
    prep: {
      servicosAbertos: 0,
      aguardando: 0,
      emServico: 0,
      atrasados: 0,
      previstosHoje: 0,
      concluidosMes: 0,
      custoPrevistoAberto: null,
      custoRealizadoMes: null,
    },
    ops: {
      transferenciasAbertas: 0,
      transferenciasParadas: 0,
      renaveSaidaPendente: 0,
      renaveProblemas: 0,
      notasPendentes: 0,
      notasRejeitadas: 0,
      restricoesAtivas: 0,
      vendas90d: 0,
    },
    deliveries: {
      aguardandoEntrega: 0,
      entregasAtrasadas: 0,
      entregasHoje: 0,
      entreguesMes: 0,
      posVendaAtivos: 0,
    },
  }
}

// Limites no fuso de São Paulo (o servidor roda em UTC).
function monthRange(now: Date) {
  return {
    start: getGoalPeriod({ frequency: 'monthly', referenceDate: now }).startsAt,
    end: getGoalPeriod({ frequency: 'daily', referenceDate: now }).endsAt,
  }
}

function todayRange(now: Date) {
  const { startsAt, endsAt } = getGoalPeriod({ frequency: 'daily', referenceDate: now })
  return { start: startsAt, end: endsAt }
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

/** "SITE" → "Site", "meta_ads" → "Meta ads" (rótulo legível da origem). */
function sourceLabel(source: string | null): string {
  if (!source) return 'Sem origem'
  const t = source.replace(/[_-]+/g, ' ').trim().toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function fmtPercent(value: number): string {
  return `${Math.round(value)}%`
}


type WidgetServices = TenantServiceKey | TenantServiceKey[]

function normalizeServices(services?: WidgetServices): TenantServiceKey[] | undefined {
  if (!services) return undefined
  return Array.isArray(services) ? services : [services]
}

function metric(
  id: string,
  label: string,
  value: string | number,
  helper?: string,
  tone: DashboardMetric['tone'] = 'gray',
  icon: DashboardMetric['icon'] = 'activity',
  href?: string,
  services?: WidgetServices,
): DashboardMetric {
  return { id, label, value, helper, tone, icon, href, services: normalizeServices(services) }
}

function item(
  id: string,
  label: string,
  value: string | number,
  helper?: string,
  tone: DashboardListItem['tone'] = 'gray',
  href?: string,
  services?: WidgetServices,
): DashboardListItem {
  return { id, label, value, helper, tone, href, services: normalizeServices(services) }
}

function section(
  id: string,
  title: string,
  items: DashboardListItem[],
  description?: string,
  icon: DashboardSection['icon'] = 'activity',
  services?: WidgetServices,
): DashboardSection {
  return {
    id,
    title,
    description,
    icon,
    items,
    emptyText: 'Dados ainda não disponíveis para este módulo.',
    services: normalizeServices(services),
  }
}


async function loadCommercial(ctx: DashboardContext, start: Date, end: Date) {
  const scope = aggregationScope(ctx)
  const window = { start, end }
  // Mesma regra de metas/ranking/comissão: a negociação conta a partir da
  // APROVAÇÃO (não da finalização), na data de referência da comissão.
  const eligibleThisMonth = commissionEligibleDealWindowWhere(window) as Prisma.DealWhereInput

  const [
    vendasTrocas,
    compras,
    retornos,
    garantias,
    servicos,
    consignacoes,
    propostasAbertas,
    propostasAprovadas,
    propostasPerdidas,
    aguardandoAprovacao,
    aguardandoFinanceiro,
    aguardandoDocumentacao,
    valorVendido,
  ] = await Promise.all([
    aggregateAchieved('SALES_EXCHANGE', scope, window),
    aggregateAchieved('PURCHASE', scope, window),
    aggregateAchieved('RETURN', scope, window),
    aggregateAchieved('EXTENDED_WARRANTY', scope, window),
    aggregateAchieved('SERVICE', scope, window),
    prisma.deal.count({ where: scopedDealWhere(ctx, { type: 'CONSIGNACAO', ...eligibleThisMonth }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: OPEN_DEALS } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, eligibleThisMonth) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: LOST_DEALS }, updatedAt: { gte: start, lte: end } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'] } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'AGUARDANDO_FINANCEIRO' }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'AGUARDANDO_DOCUMENTACAO' }) }),
    prisma.deal.aggregate({
      where: scopedDealWhere(ctx, { type: { in: ['VENDA', 'TROCA'] }, ...eligibleThisMonth }),
      _sum: { saleAmount: true },
    }),
  ])

  return {
    vendasTrocas: vendasTrocas.value,
    compras: compras.value,
    consignacoes,
    propostasAbertas,
    propostasAprovadas,
    propostasPerdidas,
    aguardandoAprovacao,
    aguardandoFinanceiro,
    aguardandoDocumentacao,
    retornos: retornos.value,
    garantias: garantias.value,
    servicos: servicos.value,
    valorVendido: num(valorVendido._sum.saleAmount),
  }
}

async function loadPendencies(ctx: DashboardContext, now: Date, todayStart: Date, todayEnd: Date) {
  const baseOpen = scopedPendencyWhere(ctx, { status: { in: OPEN_PENDENCIES } })
  const overdueWhere = scopedPendencyWhere(ctx, {
    status: { notIn: CLOSED_PENDENCIES },
    OR: [
      { status: 'VENCIDA' },
      { dueDate: { lt: now } },
      { slaDeadline: { lt: now } },
    ],
  })

  const [
    abertas,
    minhas,
    atribuidas,
    vencidas,
    vencendoHoje,
    criticas,
    aguardandoGerente,
    financeiras,
    documentacao,
    porResponsavelRaw,
  ] = await Promise.all([
    prisma.pendency.count({ where: baseOpen }),
    prisma.pendency.count({
      where: {
        ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
        status: { in: OPEN_PENDENCIES },
        OR: [
          { responsibleId: ctx.sellerId ?? NO_MATCH },
          { assignedUserId: ctx.user.id },
        ],
      },
    }),
    prisma.pendency.count({ where: scopedPendencyWhere(ctx, { status: { in: OPEN_PENDENCIES }, assignedUserId: ctx.user.id }) }),
    prisma.pendency.count({ where: overdueWhere }),
    prisma.pendency.count({
      where: scopedPendencyWhere(ctx, {
        status: { in: OPEN_PENDENCIES },
        dueDate: { gte: todayStart, lte: todayEnd },
      }),
    }),
    prisma.pendency.count({
      where: scopedPendencyWhere(ctx, {
        status: { in: OPEN_PENDENCIES },
        OR: [{ priority: 'URGENTE' }, { severity: 'CRITICAL' }],
      }),
    }),
    prisma.pendency.count({
      where: scopedPendencyWhere(ctx, {
        status: 'AGUARDANDO_RESPOSTA',
        resolvedByUserId: { not: null },
      }),
    }),
    prisma.pendency.count({
      where: scopedPendencyWhere(ctx, {
        status: { in: OPEN_PENDENCIES },
        OR: [
          { type: { contains: 'finance', mode: 'insensitive' } },
          { description: { contains: 'finance', mode: 'insensitive' } },
        ],
      }),
    }),
    prisma.pendency.count({
      where: scopedPendencyWhere(ctx, {
        status: { in: OPEN_PENDENCIES },
        OR: [
          { type: { contains: 'document', mode: 'insensitive' } },
          { description: { contains: 'document', mode: 'insensitive' } },
          { type: { contains: 'contrato', mode: 'insensitive' } },
        ],
      }),
    }),
    prisma.pendency.groupBy({
      by: ['responsibleId'],
      where: scopedPendencyWhere(ctx, { status: { in: OPEN_PENDENCIES } }),
      _count: { _all: true },
    }),
  ])

  const responsibleIds = porResponsavelRaw.map((row) => row.responsibleId).filter(Boolean)
  const sellers = responsibleIds.length
    ? await prisma.seller.findMany({
      where: { id: { in: responsibleIds } },
      select: { id: true, fullName: true, shortName: true },
    })
    : []
  const sellerNames = new Map(sellers.map((seller) => [seller.id, seller.shortName || seller.fullName]))

  return {
    abertas,
    minhas,
    atribuidas,
    vencidas,
    vencendoHoje,
    criticas,
    aguardandoGerente,
    financeiras,
    documentacao,
    porResponsavel: porResponsavelRaw
      .map((row) => item(
        `responsavel-${row.responsibleId}`,
        sellerNames.get(row.responsibleId) ?? 'Responsável',
        row._count._all,
        'Pendências abertas',
        row._count._all > 5 ? 'amber' : 'gray',
      ))
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, 5),
  }
}

async function loadGoals(ctx: DashboardContext) {
  const tenantPart = ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }
  const [minhasUser, minhasRole, unidade, tenant] = await Promise.all([
    prisma.goal.count({ where: { ...tenantPart, status: 'ATIVA', active: true, scope: 'USER', userId: ctx.user.id } }),
    prisma.goal.count({ where: { ...tenantPart, status: 'ATIVA', active: true, scope: 'ROLE', targetRole: ctx.user.role } }),
    prisma.goal.count({ where: { ...tenantPart, status: 'ATIVA', active: true, scope: 'UNIT', unitId: ctx.unitId ?? NO_MATCH } }),
    prisma.goal.count({ where: { ...tenantPart, status: 'ATIVA', active: true, scope: 'TENANT' } }),
  ])

  return { minhas: minhasUser + minhasRole, unidade, tenant }
}

async function loadRanking(ctx: DashboardContext) {
  if (!ctx.profile.canSeeRanking || !ctx.tenantId) {
    return { unitTop: [], tenantTop: [], myUnitRank: null, myTenantRank: null }
  }

  const [unitRanking, tenantRanking] = await Promise.all([
    ctx.unitId
      ? computeRanking({ tenantId: ctx.tenantId, unitId: ctx.unitId, period: 'MONTHLY', now: new Date() }).catch(() => null)
      : Promise.resolve(null),
    computeRanking({ tenantId: ctx.tenantId, period: 'MONTHLY', now: new Date() }).catch(() => null),
  ])

  const toItems = (entries: NonNullable<typeof unitRanking>['entries'] | undefined) =>
    (entries ?? []).slice(0, 5).map((entry) => item(
      `ranking-${entry.userId}`,
      `${entry.rank}º ${entry.name}`,
      entry.totalPoints,
      `Qualidade ${fmtPercent(entry.qualityScore)}`,
      entry.userId === ctx.user.id ? 'brand' : 'gray',
    ))

  return {
    unitTop: toItems(unitRanking?.entries),
    tenantTop: toItems(tenantRanking?.entries),
    myUnitRank: unitRanking?.entries.find((entry) => entry.userId === ctx.user.id)?.rank ?? null,
    myTenantRank: tenantRanking?.entries.find((entry) => entry.userId === ctx.user.id)?.rank ?? null,
  }
}

async function loadLeads(ctx: DashboardContext, start: Date, end: Date, todayStart: Date, todayEnd: Date) {
  const monthWhere = scopedLeadWhere(ctx, { createdAt: { gte: start, lte: end } })
  const tenantPart = ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }
  const visitScope: Prisma.CrmLeadVisitWhereInput = {
    ...tenantPart,
    ...(ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
    ...(ctx.profile.scope === 'SELF' ? { hostUserId: ctx.user.id } : {}),
    ...(ctx.profile.kind === 'SDR' ? { createdByUserId: ctx.user.id } : {}),
  }
  const ownInteractions = ctx.profile.scope === 'SELF' || ctx.profile.kind === 'SDR'
  const [visitasHoje, noShowMes, contatosMes, resposta, topVehicle] = await Promise.all([
    prisma.crmLeadVisit.count({ where: { ...visitScope, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED'] }, scheduledAt: { gte: todayStart, lte: todayEnd } } }).catch(() => 0),
    prisma.crmLeadVisit.count({ where: { ...visitScope, status: 'NO_SHOW', scheduledAt: { gte: start, lte: end } } }).catch(() => 0),
    prisma.crmLeadInteraction.count({
      where: {
        ...tenantPart,
        occurredAt: { gte: start, lte: end },
        type: { in: ['CALL', 'WHATSAPP', 'EMAIL'] },
        ...(ownInteractions ? { authorId: ctx.user.id } : {}),
      },
    }).catch(() => 0),
    leadFirstResponseMinutes(ctx).catch(() => null),
    prisma.marketingLead.groupBy({
      by: ['vehicleId'],
      where: scopedLeadWhere(ctx, { createdAt: { gte: start, lte: end }, vehicleId: { not: null } }),
      _count: { _all: true },
      orderBy: { _count: { vehicleId: 'desc' } },
      take: 1,
    }).then(async (rows) => {
      const top = rows[0]
      if (!top?.vehicleId) return null
      const v = await prisma.vehicle.findFirst({ where: { id: top.vehicleId, ...tenantPart }, select: { brand: true, model: true } })
      return v ? `${[v.brand, v.model].filter(Boolean).join(' ')} (${top._count._all})` : null
    }).catch(() => null),
  ])
  const [
    total,
    novos,
    semAtendimento,
    emAtendimento,
    perdidos,
    convertidos,
    meus,
    porOrigemRaw,
  ] = await Promise.all([
    prisma.marketingLead.count({ where: monthWhere }),
    prisma.marketingLead.count({ where: scopedLeadWhere(ctx, { status: 'NEW', createdAt: { gte: start, lte: end } }) }),
    prisma.marketingLead.count({ where: scopedLeadWhere(ctx, { assignedToUserId: null, status: { in: ['NEW', 'RECYCLED'] } }) }),
    prisma.marketingLead.count({ where: scopedLeadWhere(ctx, { status: { in: ['ASSIGNED', 'WORKING', 'QUALIFIED'] } }) }),
    prisma.marketingLead.count({ where: scopedLeadWhere(ctx, { status: 'LOST', updatedAt: { gte: start, lte: end } }) }),
    prisma.marketingLead.count({ where: scopedLeadWhere(ctx, { convertedAt: { gte: start, lte: end } }) }),
    prisma.marketingLead.count({ where: { ...tenantPart, deletedAt: null, assignedToUserId: ctx.user.id, status: { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] } } }),
    prisma.marketingLead.groupBy({
      by: ['source'],
      where: monthWhere,
      _count: { _all: true },
    }),
  ])

  return {
    total,
    novos,
    semAtendimento,
    emAtendimento,
    perdidos,
    convertidos,
    meus,
    porOrigem: porOrigemRaw
      .map((row) => item(`origem-${row.source ?? 'sem'}`, sourceLabel(row.source), row._count._all, 'Leads no mês'))
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, 5),
    visitasHoje,
    noShowMes,
    contatosMes,
    tempoRespostaMin: resposta?.value ?? null,
    veiculoMaisProcurado: topVehicle,
  }
}

async function loadFinancing(ctx: DashboardContext, start: Date, end: Date) {
  const monthWhere = scopedFinanceProposalWhere(ctx, { createdAt: { gte: start, lte: end } })
  const [
    total,
    simulacoes,
    enviadas,
    aprovadas,
    recusadas,
    pendentes,
    docsPendentes,
    produtos,
    porBancoRaw,
    bancos,
    retornoEstimado,
  ] = await Promise.all([
    prisma.financeProposal.count({ where: monthWhere }),
    prisma.financeProposal.count({ where: scopedFinanceProposalWhere(ctx, { status: 'SIMULACAO', createdAt: { gte: start, lte: end } }) }),
    prisma.financeProposal.count({ where: scopedFinanceProposalWhere(ctx, { status: 'ENVIADA', createdAt: { gte: start, lte: end } }) }),
    prisma.financeProposal.count({ where: scopedFinanceProposalWhere(ctx, { status: 'APROVADA', updatedAt: { gte: start, lte: end } }) }),
    prisma.financeProposal.count({ where: scopedFinanceProposalWhere(ctx, { status: 'RECUSADA', updatedAt: { gte: start, lte: end } }) }),
    prisma.financeProposal.count({ where: scopedFinanceProposalWhere(ctx, { status: { in: PENDING_FINANCE } }) }),
    prisma.financeProposalDocument.groupBy({
      by: ['proposalId'],
      where: {
        required: true,
        status: { not: 'APROVADO' },
        proposal: scopedFinanceProposalWhere(ctx),
      },
      _count: { _all: true },
    }).then((rows) => rows.length),
    prisma.financeProductSale.count({ where: { proposal: scopedFinanceProposalWhere(ctx, { createdAt: { gte: start, lte: end } }) } }),
    prisma.financeProposal.groupBy({ by: ['bankId'], where: monthWhere, _count: { _all: true }, _sum: { approvedValue: true } }),
    prisma.financeBank.findMany({
      where: ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId },
      select: { id: true, name: true },
    }),
    ctx.profile.canSeeFinancial
      ? prisma.financeSimulationOption.aggregate({
        where: {
          simulation: {
            ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }),
            ...(ctx.profile.scope === 'SELF' ? { sellerId: ctx.user.id } : {}),
            createdAt: { gte: start, lte: end },
          },
        },
        _sum: { estimatedReturn: true },
      }).then((agg) => num(agg._sum?.estimatedReturn)).catch(() => null)
      : Promise.resolve(null),
  ])

  const bankNames = new Map(bancos.map((bank) => [bank.id, bank.name]))

  return {
    total,
    simulacoes,
    enviadas,
    aprovadas,
    recusadas,
    pendentes,
    docsPendentes,
    produtos,
    porBanco: porBancoRaw
      .map((row) => item(
        `banco-${row.bankId ?? 'sem'}`,
        row.bankId ? bankNames.get(row.bankId) ?? 'Banco' : 'Sem banco',
        row._count._all,
        row._sum.approvedValue ? `Aprovado ${fmtCurrency(num(row._sum.approvedValue))}` : 'Fichas no mês',
      ))
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, 5),
    retornoEstimado,
  }
}

async function loadFinance(ctx: DashboardContext, start: Date, end: Date) {
  if (!ctx.profile.canSeeFinancial) return null

  const month = { gte: start, lte: end }
  const [
    receitas,
    despesas,
    aReceber,
    aPagar,
    pagamentosPendentes,
    recebimentosPendentes,
    comissoesPendentes,
    comissoesPagas,
  ] = await Promise.all([
    prisma.financialEntry.aggregate({ where: scopedFinancialWhere(ctx, { type: 'RECEITA', status: { in: ['RECEBIDO', 'PAGO'] }, paidDate: month }), _sum: { amount: true } }),
    prisma.financialEntry.aggregate({ where: scopedFinancialWhere(ctx, { type: 'DESPESA', status: { in: ['PAGO', 'RECEBIDO'] }, paidDate: month }), _sum: { amount: true } }),
    prisma.financialEntry.aggregate({ where: scopedFinancialWhere(ctx, { type: 'RECEITA', status: 'PREVISTO' }), _sum: { amount: true } }),
    prisma.financialEntry.aggregate({ where: scopedFinancialWhere(ctx, { type: 'DESPESA', status: 'PREVISTO' }), _sum: { amount: true } }),
    prisma.financialEntry.count({ where: scopedFinancialWhere(ctx, { type: 'DESPESA', status: 'PREVISTO' }) }),
    prisma.financialEntry.count({ where: scopedFinancialWhere(ctx, { type: 'RECEITA', status: 'PREVISTO' }) }),
    prisma.commissionCalculation.aggregate({
      where: {
        ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
        status: { in: ['PREVISTO', 'APROVADO'] },
      },
      _sum: { commissionValue: true },
    }),
    prisma.commissionCalculation.aggregate({
      where: {
        ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
        status: 'PAGO',
        paidAt: month,
      },
      _sum: { commissionValue: true },
    }),
  ])

  return {
    receitas: num(receitas._sum.amount),
    despesas: num(despesas._sum.amount),
    aReceber: num(aReceber._sum.amount),
    aPagar: num(aPagar._sum.amount),
    pagamentosPendentes,
    recebimentosPendentes,
    comissoesPendentes: num(comissoesPendentes._sum.commissionValue),
    comissoesPagas: num(comissoesPagas._sum.commissionValue),
  }
}

async function loadPurchases(ctx: DashboardContext, start: Date, end: Date) {
  const baseEvaluation: Prisma.VehicleEvaluationWhereInput = {
    ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
    ...(ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
  }

  const [
    avaliados,
    emAndamento,
    aprovados,
    pendentes,
    comprados,
    trocas,
    estoquePrevisto,
    aguardandoDocumentacao,
  ] = await Promise.all([
    prisma.vehicleEvaluation.count({ where: { ...baseEvaluation, createdAt: { gte: start, lte: end } } }),
    prisma.vehicleEvaluation.count({ where: { ...baseEvaluation, status: { in: ['DRAFT', 'IN_PROGRESS', 'AGUARDANDO_APROVACAO', 'PENDING_REVIEW'] } } }),
    prisma.vehicleEvaluation.count({ where: { ...baseEvaluation, OR: [{ result: 'APROVADO' }, { status: { in: ['APPROVED', 'LIBERADA'] } }] } }),
    prisma.vehicleEvaluation.count({ where: { ...baseEvaluation, result: 'PENDENTE' } }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { type: 'COMPRA', ...(commissionEligibleDealWindowWhere({ start, end }) as Prisma.DealWhereInput) }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { type: 'TROCA', status: { in: OPEN_DEALS } }) }),
    prisma.vehicleEvaluation.count({ where: { ...baseEvaluation, vehicleId: { not: null }, releasedAt: { gte: start, lte: end } } }),
    prisma.pendency.count({ where: scopedPendencyWhere(ctx, { status: { in: OPEN_PENDENCIES }, type: { contains: 'document', mode: 'insensitive' } }) }),
  ])

  return {
    avaliados,
    emAndamento,
    aprovados,
    pendentes,
    comprados,
    trocas,
    estoquePrevisto,
    aguardandoDocumentacao,
  }
}

async function loadDocuments(ctx: DashboardContext) {
  const [
    pendentes,
    contratos,
    assinaturas,
    entregas,
    vistorias,
    transferencias,
  ] = await Promise.all([
    prisma.pendency.count({ where: scopedPendencyWhere(ctx, { status: { in: OPEN_PENDENCIES }, OR: [{ type: { contains: 'document', mode: 'insensitive' } }, { description: { contains: 'document', mode: 'insensitive' } }] }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'AGUARDANDO_CONTRATO' }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'AGUARDANDO_ASSINATURA' }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'AGUARDANDO_ENTREGA' }) }),
    prisma.pendency.count({ where: scopedPendencyWhere(ctx, { status: { in: OPEN_PENDENCIES }, OR: [{ type: { contains: 'vistoria', mode: 'insensitive' } }, { description: { contains: 'vistoria', mode: 'insensitive' } }] }) }),
    prisma.pendency.count({ where: scopedPendencyWhere(ctx, { status: { in: OPEN_PENDENCIES }, OR: [{ type: { contains: 'transfer', mode: 'insensitive' } }, { description: { contains: 'transfer', mode: 'insensitive' } }] }) }),
  ])

  return { pendentes, contratos, assinaturas, entregas, vistorias, transferencias }
}

async function loadSystem(ctx: DashboardContext) {
  const base = ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }
  const [usuariosAtivos, unidades, pendenciasCriticas, alertasSistema] = await Promise.all([
    prisma.user.count({ where: { ...base, status: 'ATIVO' } }),
    prisma.unit.count({ where: { ...base, active: true } }),
    prisma.pendency.count({ where: scopedPendencyWhere(ctx, { status: { in: OPEN_PENDENCIES }, OR: [{ priority: 'URGENTE' }, { severity: 'CRITICAL' }] }) }),
    prisma.notification.count({
      where: {
        ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
        type: { in: ['ERRO_INTEGRACAO', 'ERRO_ENVIO', 'SISTEMA'] },
        read: false,
      },
    }).catch(() => 0),
  ])

  return { usuariosAtivos, unidades, pendenciasCriticas, alertasSistema }
}

async function loadUnits(ctx: DashboardContext, start: Date, end: Date) {
  if (ctx.profile.scope !== 'TENANT' && ctx.profile.scope !== 'GLOBAL') return []

  const salesByUnit = await prisma.deal.groupBy({
    by: ['unitId'],
    where: scopedDealWhere(ctx, {
      type: { in: ['VENDA', 'TROCA'] },
      ...(commissionEligibleDealWindowWhere({ start, end }) as Prisma.DealWhereInput),
    }),
    _count: { _all: true },
  })
  const unitIds = salesByUnit.map((row) => row.unitId).filter(Boolean) as string[]
  const units = unitIds.length
    ? await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } })
    : []
  const names = new Map(units.map((unit) => [unit.id, unit.name]))

  return salesByUnit
    .map((row) => item(`unit-${row.unitId ?? 'sem'}`, row.unitId ? names.get(row.unitId) ?? 'Unidade' : 'Sem unidade', row._count._all, 'Vendas/trocas no mês'))
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 5)
}

async function loadStock(ctx: DashboardContext, canSeeCost: boolean, canSeePublications: boolean) {
  const now = Date.now()
  const where = (extra?: Prisma.VehicleWhereInput) => inStockVehicleWhere(ctx, extra)
  const [
    total,
    consignado,
    parceiro,
    emPreparacao,
    emNegociacao,
    disponiveis,
    ate30,
    de31a60,
    de61a90,
    acima90,
    valores,
    publicados,
  ] = await Promise.all([
    prisma.vehicle.count({ where: where() }),
    // Carro de loja parceira também vem como CONSIGNADO: conta só como parceiro.
    prisma.vehicle.count({ where: where({ stockType: 'CONSIGNADO', OR: [{ originType: null }, { originType: { not: 'PARTNER' } }] }) }),
    prisma.vehicle.count({ where: where({ originType: 'PARTNER' }) }),
    prisma.vehicle.count({ where: where({ stockStatus: { in: [...PREP_STOCK_STATUSES] } }) }),
    prisma.vehicle.count({ where: where({ stockStatus: { in: [...NEGOTIATION_STOCK_STATUSES] } }) }),
    prisma.vehicle.count({ where: where({ stockStatus: { in: [...AVAILABLE_STOCK_STATUSES] } }) }),
    // Faixas do relatório de parados (sem data de entrada = recém-chegado).
    prisma.vehicle.count({ where: where({ OR: [{ entryDate: null }, { entryDate: { gte: daysAgo(30, now) } }] }) }),
    prisma.vehicle.count({ where: where({ entryDate: { lt: daysAgo(30, now), gte: daysAgo(60, now) } }) }),
    prisma.vehicle.count({ where: where({ entryDate: { lt: daysAgo(60, now), gte: daysAgo(AGED_STOCK_DAYS, now) } }) }),
    prisma.vehicle.count({ where: where({ entryDate: { lt: daysAgo(AGED_STOCK_DAYS, now) } }) }),
    prisma.vehicle.aggregate({ where: where(), _sum: { salePrice: true, purchasePrice: true } }),
    canSeePublications
      ? prisma.publication.groupBy({
        by: ['vehicleId'],
        where: { status: 'PUBLICADO', vehicle: where() },
      }).then((rows) => rows.length).catch(() => null)
      : Promise.resolve(null),
  ])

  return {
    total,
    proprio: Math.max(0, total - consignado - parceiro),
    consignado,
    parceiro,
    emPreparacao,
    emNegociacao,
    disponiveis,
    publicados,
    aging: { ate30, de31a60, de61a90, acima90 },
    valorVenda: num(valores._sum.salePrice),
    valorImobilizado: canSeeCost ? num(valores._sum.purchasePrice) : null,
  }
}

async function loadPreparation(ctx: DashboardContext, now: Date, todayStart: Date, todayEnd: Date, start: Date, end: Date, canSeeCost: boolean) {
  const open = { status: { in: [...OPEN_SERVICE_STATUSES] } }
  const [servicosAbertos, aguardando, emServico, atrasados, previstosHoje, concluidosMes, custoAberto, custoMes] = await Promise.all([
    prisma.vehicleService.count({ where: serviceWhere(ctx, open) }),
    prisma.vehicleService.count({ where: serviceWhere(ctx, { status: 'AGUARDANDO' }) }),
    prisma.vehicleService.count({ where: serviceWhere(ctx, { status: 'EM_SERVICO' }) }),
    prisma.vehicleService.count({ where: overdueServiceWhere(ctx, now) }),
    prisma.vehicleService.count({ where: serviceWhere(ctx, { ...open, dueAt: { gte: todayStart, lte: todayEnd } }) }),
    prisma.vehicleService.count({ where: serviceWhere(ctx, { status: 'CONCLUIDO', finishedAt: { gte: start, lte: end } }) }),
    canSeeCost ? prisma.vehicleService.aggregate({ where: serviceWhere(ctx, open), _sum: { estimatedCost: true } }) : Promise.resolve(null),
    canSeeCost ? prisma.vehicleService.aggregate({ where: serviceWhere(ctx, { status: 'CONCLUIDO', finishedAt: { gte: start, lte: end } }), _sum: { actualCost: true, estimatedCost: true } }) : Promise.resolve(null),
  ])
  return {
    servicosAbertos,
    aguardando,
    emServico,
    atrasados,
    previstosHoje,
    concluidosMes,
    custoPrevistoAberto: custoAberto ? num(custoAberto._sum.estimatedCost) : null,
    custoRealizadoMes: custoMes ? num(custoMes._sum.actualCost ?? custoMes._sum.estimatedCost) : null,
  }
}

async function loadOperations(ctx: DashboardContext) {
  const now = Date.now()
  const tenantPart = ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }
  const [abertas, paradas, saidaPendente, problemas, notasPendentes, notasRejeitadas, restricoes, vendas90d] = await Promise.all([
    prisma.vehicleOperation.count({ where: openTransferWhere(ctx) }),
    prisma.vehicleOperation.count({ where: stalledTransferWhere(ctx, now) }),
    prisma.vehicleOperation.count({ where: operationWhere(ctx, { kind: 'SALE', cancelledAt: null, commercialStatus: 'SOLD', renaveStatus: 'PENDING' }) }),
    prisma.vehicleOperation.count({ where: operationWhere(ctx, { renaveStatus: { in: ['REJECTED', 'UNKNOWN'] } }) }),
    prisma.vehicleOperation.count({ where: operationWhere(ctx, { cancelledAt: null, commercialStatus: { in: ['SOLD', 'ACQUIRED', 'CLOSED'] }, fiscalStatus: { in: ['PENDING', 'PROCESSING', 'UNKNOWN'] } }) }),
    prisma.vehicleOperation.count({ where: operationWhere(ctx, { cancelledAt: null, fiscalStatus: 'REJECTED' }) }),
    prisma.vehicleRestriction.count({ where: { ...tenantPart, status: 'ACTIVE', blocking: true } }),
    prisma.vehicleOperation.count({ where: operationWhere(ctx, { kind: 'SALE', cancelledAt: null, commercialStatus: 'SOLD', createdAt: { gte: daysAgo(90, now) } }) }),
  ])
  return {
    transferenciasAbertas: abertas,
    transferenciasParadas: paradas,
    renaveSaidaPendente: saidaPendente,
    renaveProblemas: problemas,
    notasPendentes,
    notasRejeitadas,
    restricoesAtivas: restricoes,
    vendas90d,
  }
}

async function loadDeliveries(ctx: DashboardContext, todayStart: Date, todayEnd: Date, start: Date, end: Date) {
  const waiting = { status: 'AGUARDANDO_ENTREGA' as DealStatus }
  const [aguardandoEntrega, entregasAtrasadas, entregasHoje, entreguesMes, posVendaAtivos] = await Promise.all([
    prisma.deal.count({ where: scopedDealWhere(ctx, waiting) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { ...waiting, deliveryDate: { lt: todayStart } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { ...waiting, deliveryDate: { gte: todayStart, lte: todayEnd } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'ENTREGUE', updatedAt: { gte: start, lte: end } }) }),
    prisma.sellerQueuePosVenda.count({
      where: {
        ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }),
        ...(ctx.profile.scope === 'UNIT' ? { unitId: ctx.unitId ?? NO_MATCH } : {}),
        ...(ctx.profile.scope === 'SELF' ? { sellerId: ctx.user.id } : {}),
        status: { in: ['ACTIVE', 'RETURN_REQUESTED'] },
      },
    }).catch(() => 0),
  ])
  return { aguardandoEntrega, entregasAtrasadas, entregasHoje, entreguesMes, posVendaAtivos }
}

function stockSection(raw: RawDashboardMetrics): DashboardSection {
  const s = raw.stock
  return section('estoque', 'Estoque', [
    item('estoque-total', 'Veículos em estoque', s.total, `${s.proprio} próprios · ${s.consignado} consignados · ${s.parceiro} de parceiros`, 'brand', '/estoque'),
    item('estoque-disponivel', 'Disponíveis para venda', s.disponiveis, s.publicados != null ? `${s.publicados} com anúncio publicado` : 'Prontos para vender', 'green', '/estoque'),
    item('estoque-preparacao', 'Em preparação', s.emPreparacao, 'Ainda não estão prontos', s.emPreparacao > 0 ? 'amber' : 'gray', '/relatorios/estoque/preparacao'),
    item('estoque-negociacao', 'Em negociação / reservados', s.emNegociacao, 'Com cliente', 'blue', '/estoque'),
    item('estoque-aging', 'Tempo em estoque', `${s.aging.ate30} · ${s.aging.de31a60} · ${s.aging.de61a90} · ${s.aging.acima90}`, '0–30 · 31–60 · 61–90 · +90 dias', s.aging.acima90 > 0 ? 'amber' : 'gray', '/relatorios/estoque/parados'),
    item('estoque-valor', 'Valor de venda do estoque', fmtCurrency(s.valorVenda), 'Soma dos preços anunciados', 'slate', '/relatorios/estoque/atual'),
    ...(s.valorImobilizado != null
      ? [item('valor-imobilizado', 'Valor imobilizado', fmtCurrency(s.valorImobilizado), 'Custo de aquisição do estoque', 'purple', '/relatorios/estoque/margem')]
      : []),
  ], 'Fonte única: cadastro do estoque.', 'stock', ['estoque'])
}

function prepSection(raw: RawDashboardMetrics): DashboardSection {
  const p = raw.prep
  return section('preparacao', 'Preparação', [
    item('prep-veiculos', 'Veículos em preparação', raw.stock.emPreparacao, 'Pendente de preparação ou em serviço', 'brand', '/relatorios/estoque/preparacao'),
    item('prep-atrasados', 'Serviços atrasados', p.atrasados, 'Previsão de entrega vencida', p.atrasados > 0 ? 'red' : 'gray', '/relatorios/estoque/preparacao'),
    item('prep-aguardando', 'Aguardando início', p.aguardando, 'Serviço ainda não enviado', p.aguardando > 0 ? 'amber' : 'gray', '/relatorios/estoque/preparacao'),
    item('prep-em-servico', 'Em serviço', p.emServico, 'No prestador/oficina', 'blue', '/relatorios/estoque/preparacao'),
    item('prep-hoje', 'Previstos para hoje', p.previstosHoje, 'Devem voltar hoje', 'teal', '/relatorios/estoque/preparacao'),
    item('prep-concluidos', 'Concluídos no mês', p.concluidosMes, 'Serviços encerrados', 'green', '/relatorios/estoque/preparacao'),
    ...(p.custoPrevistoAberto != null
      ? [item('prep-custo', 'Custo previsto em aberto', fmtCurrency(p.custoPrevistoAberto), p.custoRealizadoMes != null ? `Realizado no mês: ${fmtCurrency(p.custoRealizadoMes)}` : undefined, 'purple', '/relatorios/estoque/preparacao')]
      : []),
  ], 'Serviços de preparação do estoque.', 'clock', ['estoque'])
}

function opsSection(raw: RawDashboardMetrics): DashboardSection {
  const o = raw.ops
  return section('documentacao-veicular', 'Documentação veicular', [
    item('ops-transferencias', 'Transferências em aberto', o.transferenciasAbertas, o.transferenciasParadas > 0 ? `${o.transferenciasParadas} paradas há +${STALLED_TRANSFER_DAYS} dias` : 'Vendas aguardando transferência', o.transferenciasParadas > 0 ? 'amber' : 'gray', '/operacoes/transferencias?aba=open'),
    item('ops-renave-saida', 'RENAVE — saída pendente', o.renaveSaidaPendente, 'Vendas sem saída registrada', o.renaveSaidaPendente > 0 ? 'amber' : 'gray', '/operacoes/renave?aba=pending'),
    item('ops-renave-problema', 'RENAVE com problema', o.renaveProblemas, 'Rejeitado ou sem confirmação', o.renaveProblemas > 0 ? 'red' : 'gray', '/operacoes/renave?aba=issues'),
    item('ops-notas', 'Notas fiscais pendentes', o.notasPendentes, o.notasRejeitadas > 0 ? `${o.notasRejeitadas} rejeitadas` : 'Aguardando emissão', o.notasRejeitadas > 0 ? 'red' : 'gray', '/operacoes/notas'),
    item('ops-restricoes', 'Restrições bloqueantes', o.restricoesAtivas, 'Gravame, judicial e outras', o.restricoesAtivas > 0 ? 'red' : 'gray', '/estoque/conformidade'),
    item('ops-saude', 'Saúde documental', documentalHealth(o), 'Vendas dos últimos 90 dias sem pendência travada', 'green', '/operacoes'),
  ], 'Transferência, RENAVE, notas e restrições.', 'documents')
}

function deliveriesSection(raw: RawDashboardMetrics): DashboardSection {
  const d = raw.deliveries
  return section('entregas', 'Entregas e pós-venda', [
    item('entregas-aguardando', 'Aguardando entrega', d.aguardandoEntrega, 'Vendas prontas para entregar', 'brand', '/negociacoes?status=AGUARDANDO_ENTREGA'),
    item('entregas-atrasadas', 'Entregas atrasadas', d.entregasAtrasadas, 'Data prevista já passou', d.entregasAtrasadas > 0 ? 'red' : 'gray', '/negociacoes?status=AGUARDANDO_ENTREGA'),
    item('entregas-hoje', 'Entregas de hoje', d.entregasHoje, 'Previstas para hoje', d.entregasHoje > 0 ? 'amber' : 'gray', '/negociacoes?status=AGUARDANDO_ENTREGA'),
    item('entregues-mes', 'Entregues no mês', d.entreguesMes, 'Concluídas', 'green', '/negociacoes?status=ENTREGUE'),
    item('pos-venda-ativos', 'Atendimentos de pós-venda abertos', d.posVendaAtivos, 'Na fila de atendimento', 'blue', '/vendedor-da-vez/atendimentos'),
  ], 'Do fechamento até o cliente com o carro.', 'check', ['negociacoes'])
}

/** % de vendas recentes sem pendência documental travada — só com dado real. */
function documentalHealth(o: RawDashboardMetrics['ops']): string {
  if (o.vendas90d <= 0) return 'Sem dados'
  const travadas = Math.min(o.vendas90d, o.transferenciasParadas + o.renaveProblemas + o.notasRejeitadas)
  return fmtPercent(((o.vendas90d - travadas) / o.vendas90d) * 100)
}

function commonSection(raw: RawDashboardMetrics, profile: DashboardProfile): DashboardSection {
  const rankingHint =
    raw.ranking.myTenantRank
      ? `Sua posição no tenant: ${raw.ranking.myTenantRank}º`
      : raw.ranking.myUnitRank
        ? `Sua posição na unidade: ${raw.ranking.myUnitRank}º`
        : 'Ranking disponível conforme permissão'

  return section('resumo-comercial', 'Resumo Comercial', [
    item('vendas-mes', 'Vendas e trocas do mês', raw.commercial.vendasTrocas, profile.scopeLabel, 'brand', '/negociacoes', 'negociacoes'),
    item('meta-mes', 'Metas ativas', raw.goals.minhas + raw.goals.unidade + raw.goals.tenant, 'Individuais, unidade e tenant', 'green', '/metas'),
    item('ranking-resumo', 'Ranking resumido', raw.ranking.unitTop[0]?.label ?? 'Sem ranking calculado', rankingHint, 'amber', '/ranking/geral'),
    item('pendencias-criticas', 'Pendências críticas', raw.pendencies.criticas, 'Abertas no escopo permitido', raw.pendencies.criticas > 0 ? 'red' : 'gray', '/pendencias/central'),
  ], 'Bloco comum para todos os perfis, sempre respeitando escopo e permissão.', 'sales')
}

function buildSeller(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('minhas-vendas', 'Minhas vendas/trocas', raw.commercial.vendasTrocas, 'Realizadas no mês', 'brand', 'sales', '/negociacoes'),
      metric('minhas-metas', 'Minhas metas', raw.goals.minhas, 'Metas individuais ativas', 'green', 'target', '/metas'),
      metric('minhas-pendencias', 'Minhas pendências', raw.pendencies.minhas, 'Abertas ou atribuídas', raw.pendencies.minhas > 0 ? 'amber' : 'gray', 'pendencies', '/pendencias/minhas'),
      metric('posicao-ranking', 'Minha posição', raw.ranking.myUnitRank ? `${raw.ranking.myUnitRank}º` : '—', 'Ranking da unidade', 'amber', 'ranking', '/ranking/unidade'),
    ],
    sections: [
      section('minha-performance', 'Minha Performance', [
        item('compras', 'Compras realizadas/indicadas', raw.commercial.compras, 'No mês', 'teal'),
        item('retornos', 'Retornos registrados', raw.commercial.retornos, 'Negociações com retorno', 'blue'),
        item('garantias', 'Garantias vendidas', raw.commercial.garantias, 'No mês', 'purple'),
        item('servicos', 'Serviços/produtos vendidos', raw.commercial.servicos + raw.financing.produtos, 'Serviços + produtos F&I', 'cyan'),
      ], undefined, 'target'),
      section('trabalho-dia', 'Trabalho do Dia', [
        item('leads-andamento', 'Leads em andamento', raw.leads.meus || raw.leads.emAtendimento, 'Atribuídos ou ativos', 'blue', '/marketing/sdr/inbox'),
        item('propostas-abertas', 'Propostas abertas', raw.commercial.propostasAbertas, 'Negociações em aberto', 'slate', '/negociacoes'),
        item('propostas-aprovadas', 'Propostas aprovadas', raw.commercial.propostasAprovadas, 'No período', 'green', '/negociacoes'),
        item('vencendo-hoje', 'Pendências vencendo hoje', raw.pendencies.vencendoHoje, 'Atenção do dia', raw.pendencies.vencendoHoje > 0 ? 'amber' : 'gray', '/pendencias/minhas'),
      ], undefined, 'clock'),
      section('ranking', 'Ranking', [
        ...raw.ranking.unitTop,
        ...raw.ranking.tenantTop.slice(0, 3).map((row) => ({ ...row, id: `tenant-${row.id}`, helper: 'Ranking do tenant' })),
      ], 'Ranking da unidade e visão resumida do tenant.', 'ranking'),
    ],
  }
}

function buildManager(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('vendas-unidade', 'Vendas da unidade', raw.commercial.vendasTrocas, 'Mês atual', 'brand', 'sales', '/negociacoes'),
      metric('propostas-andamento', 'Negociações em andamento', raw.commercial.propostasAbertas, 'Abertas na unidade', 'blue', 'activity', '/negociacoes'),
      metric('pendencias-criticas', 'Pendências críticas', raw.pendencies.criticas, 'Unidade', raw.pendencies.criticas > 0 ? 'red' : 'gray', 'alert', '/pendencias/gerencia'),
      metric('ranking-equipe', 'Equipe no ranking', raw.ranking.unitTop.length, 'Vendedores ranqueados', 'amber', 'ranking', '/ranking/unidade'),
    ],
    sections: [
      section('equipe', 'Equipe', [
        ...raw.ranking.unitTop,
        item('leads-parados', 'Leads sem atendimento', raw.leads.semAtendimento, 'Unidade', raw.leads.semAtendimento > 0 ? 'amber' : 'gray', '/marketing/sdr/inbox'),
      ], undefined, 'users'),
      section('operacao-unidade', 'Operação da Unidade', [
        item('aguardando-aprovacao', 'Aguardando aprovação', raw.commercial.aguardandoAprovacao, 'Negociações', 'amber', '/negociacoes/aprovacoes'),
        item('documentacao', 'Documentação pendente', raw.documents.pendentes + raw.commercial.aguardandoDocumentacao, 'Pendências e negociações', 'purple', '/pendencias/central'),
        item('financeiro', 'Aguardando financeiro', raw.commercial.aguardandoFinanceiro, 'Negociações', 'blue', '/negociacoes'),
        item(
          'por-responsavel',
          'Pendências por responsável',
          raw.pendencies.porResponsavel[0]?.label ?? 'Sem pendências',
          raw.pendencies.porResponsavel[0] ? `${raw.pendencies.porResponsavel[0].value} abertas` : 'Maior concentração',
          'slate',
        ),
      ], undefined, 'pendencies'),
      section('comparativo', 'Comparativo', [
        item(
          'posicao-unidade',
          'Unidade destaque',
          raw.units[0]?.label ?? 'Sem ranking de unidades',
          raw.units[0] ? `${raw.units[0].value} vendas/trocas no mês` : 'Sem vendas por unidade',
          'brand',
        ),
        item('vendas-perdidas', 'Propostas perdidas', raw.commercial.propostasPerdidas, 'No período', raw.commercial.propostasPerdidas > 0 ? 'red' : 'gray'),
        item('garantias', 'Garantias/produtos', raw.commercial.garantias + raw.financing.produtos, 'No mês', 'green'),
      ], undefined, 'activity'),
    ],
  }
}

/** Cockpit executivo (Administrador da loja e Gerente Geral): visão da loja inteira. */
function buildExecutive(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  const c = raw.commercial
  const vendas = c.vendasTrocas
  const ticket = vendas > 0 ? c.valorVendido / vendas : null
  const conversao = raw.leads.total > 0 ? (raw.leads.convertidos / raw.leads.total) * 100 : null
  return {
    highlights: [
      metric('vendas-tenant', 'Vendas e trocas no mês', vendas, 'Aprovadas — mesma regra do ranking', 'brand', 'sales', '/negociacoes'),
      metric('valor-vendido', 'Faturamento de veículos', fmtCurrency(c.valorVendido), ticket != null ? `Ticket médio ${fmtCurrency(ticket)}` : 'Sem vendas no mês', 'green', 'money', '/relatorios/negociacoes/vendas'),
      metric('conversao', 'Conversão de leads', conversao != null ? fmtPercent(conversao) : 'Sem dados', `${raw.leads.convertidos} de ${raw.leads.total} leads do mês`, 'blue', 'leads', '/crm/leads'),
      metric('estoque-total', 'Veículos em estoque', raw.stock.total, raw.stock.aging.acima90 > 0 ? `${raw.stock.aging.acima90} há mais de 90 dias` : 'Nenhum acima de 90 dias', raw.stock.aging.acima90 > 0 ? 'amber' : 'gray', 'stock', '/estoque'),
    ],
    sections: [
      section('comercial', 'Comercial', [
        item('propostas-abertas', 'Negociações em andamento', c.propostasAbertas, 'Abertas', 'slate', '/negociacoes'),
        item('aguardando-aprovacao', 'Aguardando aprovação', c.aguardandoAprovacao, 'Precisam de decisão', c.aguardandoAprovacao > 0 ? 'amber' : 'gray', '/negociacoes/aprovacoes'),
        item('compras', 'Compras no mês', c.compras, 'Aprovadas', 'teal', '/negociacoes?type=COMPRA'),
        item('consignacoes', 'Consignações no mês', c.consignacoes, 'Aprovadas', 'purple', '/negociacoes?type=CONSIGNACAO'),
        item('vendas-perdidas', 'Negociações perdidas', c.propostasPerdidas, 'No mês', c.propostasPerdidas > 0 ? 'red' : 'gray', '/negociacoes?status=CANCELADA,RECUSADA,DESAPROVADA'),
        item('garantias', 'Garantias e produtos', c.garantias + raw.financing.produtos + c.servicos, 'Vendidos no mês', 'green', '/relatorios/comissoes/garantias'),
      ], 'Negociações aprovadas contam no mês da aprovação.', 'sales'),
      stockSection(raw),
      prepSection(raw),
      section('crm', 'CRM e atendimento', [
        item('leads-mes', 'Leads no mês', raw.leads.total, `${raw.leads.novos} ainda novos`, 'brand', '/crm/leads'),
        item('leads-sem-atendimento', 'Sem responsável', raw.leads.semAtendimento, 'Aguardando distribuição', raw.leads.semAtendimento > 0 ? 'amber' : 'gray', '/marketing/sdr/inbox'),
        item('tempo-resposta', 'Tempo até o primeiro contato', raw.leads.tempoRespostaMin != null ? formatInsightValue(raw.leads.tempoRespostaMin, 'min') : 'Sem dados suficientes', 'Média dos últimos 30 dias', raw.leads.tempoRespostaMin != null && raw.leads.tempoRespostaMin > 15 ? 'amber' : 'gray', '/crm/leads'),
        item('visitas-hoje', 'Visitas de hoje', raw.leads.visitasHoje, raw.leads.noShowMes > 0 ? `${raw.leads.noShowMes} não compareceram no mês` : 'Agenda da loja', 'blue', '/crm/atendimentos'),
        ...raw.leads.porOrigem.slice(0, 3).map((row) => ({ ...row, href: '/crm/leads' })),
      ], 'Origem, velocidade e agenda.', 'leads'),
      section('financeiro', 'Financeiro', raw.finance ? [
        item('receitas', 'Recebido no mês', fmtCurrency(raw.finance.receitas), `Pago no mês: ${fmtCurrency(raw.finance.despesas)}`, 'green', '/financeiro/extrato'),
        item('a-receber', 'A receber', fmtCurrency(raw.finance.aReceber), `${raw.finance.recebimentosPendentes} lançamentos`, 'blue', '/financeiro/receber'),
        item('a-pagar', 'A pagar', fmtCurrency(raw.finance.aPagar), `${raw.finance.pagamentosPendentes} lançamentos`, 'amber', '/financeiro/pagar'),
        item('comissoes', 'Comissões previstas/aprovadas', fmtCurrency(raw.finance.comissoesPendentes), `Pagas no mês: ${fmtCurrency(raw.finance.comissoesPagas)}`, 'purple', '/comissoes/lancamentos'),
      ] : [], 'Somente para quem tem o Centro Financeiro liberado.', 'money'),
      opsSection(raw),
      deliveriesSection(raw),
      section('unidades', 'Vendas por unidade', raw.units.map((row) => ({ ...row, href: '/negociacoes' })), 'Vendas/trocas aprovadas no mês.', 'users', ['negociacoes', 'relatorios']),
      section('ranking-geral', 'Ranking da loja', raw.ranking.tenantTop.map((row) => ({ ...row, href: '/ranking/geral' })), 'Pontuação do mês.', 'ranking'),
    ],
  }
}

function buildGeneralManager(raw: RawDashboardMetrics) {
  return buildExecutive(raw)
}

function buildAdmin(raw: RawDashboardMetrics) {
  return buildExecutive(raw)
}

function buildDocumentation(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  const o = raw.ops
  return {
    highlights: [
      metric('doc-transferencias', 'Transferências em aberto', o.transferenciasAbertas, o.transferenciasParadas > 0 ? `${o.transferenciasParadas} paradas` : 'Nenhuma parada', o.transferenciasParadas > 0 ? 'amber' : 'brand', 'documents', '/operacoes/transferencias?aba=open'),
      metric('doc-renave', 'RENAVE pendente', o.renaveSaidaPendente + o.renaveProblemas, o.renaveProblemas > 0 ? `${o.renaveProblemas} com problema` : 'Saídas a registrar', o.renaveProblemas > 0 ? 'red' : 'blue', 'documents', '/operacoes/renave?aba=pending'),
      metric('doc-saude', 'Saúde documental', documentalHealth(o), 'Vendas dos últimos 90 dias', 'green', 'check', '/operacoes'),
      metric('doc-entregas', 'Aguardando entrega', raw.deliveries.aguardandoEntrega, raw.deliveries.entregasAtrasadas > 0 ? `${raw.deliveries.entregasAtrasadas} atrasadas` : 'Em dia', raw.deliveries.entregasAtrasadas > 0 ? 'red' : 'gray', 'clock', '/negociacoes?status=AGUARDANDO_ENTREGA'),
    ],
    sections: [
      opsSection(raw),
      section('documentacao', 'Contratos e assinaturas', [
        item('aguardando-doc', 'Negociações aguardando documentação', raw.commercial.aguardandoDocumentacao, 'Etapa de documentação', 'purple', '/negociacoes?status=AGUARDANDO_DOCUMENTACAO'),
        item('contratos', 'Aguardando contrato', raw.documents.contratos, 'Gerar contrato', 'blue', '/negociacoes?status=AGUARDANDO_CONTRATO'),
        item('assinaturas', 'Aguardando assinatura', raw.documents.assinaturas, 'Cliente precisa assinar', 'amber', '/negociacoes?status=AGUARDANDO_ASSINATURA'),
        item('pendencias-doc', 'Pendências de documentação', raw.documents.pendentes, 'Abertas', raw.documents.pendentes > 0 ? 'amber' : 'gray', '/pendencias/central'),
      ], 'Da venda aprovada ao contrato assinado.', 'documents'),
      deliveriesSection(raw),
    ],
  }
}

function buildPreparation(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  const p = raw.prep
  return {
    highlights: [
      metric('prep-veiculos', 'Veículos em preparação', raw.stock.emPreparacao, 'Ainda não estão prontos', 'brand', 'stock', '/relatorios/estoque/preparacao'),
      metric('prep-atrasados', 'Serviços atrasados', p.atrasados, 'Previsão vencida', p.atrasados > 0 ? 'red' : 'gray', 'alert', '/relatorios/estoque/preparacao'),
      metric('prep-hoje', 'Previstos para hoje', p.previstosHoje, 'Devem voltar hoje', p.previstosHoje > 0 ? 'amber' : 'gray', 'clock', '/relatorios/estoque/preparacao'),
      metric('prep-concluidos', 'Concluídos no mês', p.concluidosMes, 'Serviços encerrados', 'green', 'check', '/relatorios/estoque/preparacao'),
    ],
    sections: [prepSection(raw), stockSection(raw)],
  }
}

function buildPosVenda(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  const d = raw.deliveries
  return {
    highlights: [
      metric('pv-aguardando', 'Aguardando entrega', d.aguardandoEntrega, 'Vendas prontas para entregar', 'brand', 'clock', '/negociacoes?status=AGUARDANDO_ENTREGA'),
      metric('pv-atrasadas', 'Entregas atrasadas', d.entregasAtrasadas, 'Data prevista passou', d.entregasAtrasadas > 0 ? 'red' : 'gray', 'alert', '/negociacoes?status=AGUARDANDO_ENTREGA'),
      metric('pv-hoje', 'Entregas de hoje', d.entregasHoje, 'Previstas para hoje', d.entregasHoje > 0 ? 'amber' : 'gray', 'clock', '/negociacoes?status=AGUARDANDO_ENTREGA'),
      metric('pv-entregues', 'Entregues no mês', d.entreguesMes, 'Concluídas', 'green', 'check', '/negociacoes?status=ENTREGUE'),
    ],
    sections: [deliveriesSection(raw), opsSection(raw)],
  }
}

function buildFinance(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('a-receber', 'Recebimentos pendentes', raw.finance ? fmtCurrency(raw.finance.aReceber) : '—', 'Previstos', 'blue', 'money', '/financeiro/lancamentos'),
      metric('a-pagar', 'Pagamentos pendentes', raw.finance ? fmtCurrency(raw.finance.aPagar) : '—', 'Previstos', 'amber', 'money', '/financeiro/lancamentos'),
      metric('comissoes', 'Comissões a pagar', raw.finance ? fmtCurrency(raw.finance.comissoesPendentes) : '—', 'Previstas/aprovadas', 'purple', 'finance', '/comissoes/lancamentos'),
      metric('divergencias', 'Pendências financeiras', raw.pendencies.financeiras, 'Em aberto', raw.pendencies.financeiras > 0 ? 'red' : 'gray', 'alert', '/pendencias/central'),
    ],
    sections: [
      section('financeiro', 'Fila Financeira', [
        item('aguardando-financeiro', 'Vendas aguardando financeiro', raw.commercial.aguardandoFinanceiro, 'Negociações', 'amber', '/negociacoes'),
        item('recebimentos', 'Recebimentos pendentes', raw.finance?.recebimentosPendentes ?? '—', 'Quantidade', 'blue'),
        item('pagamentos', 'Pagamentos pendentes', raw.finance?.pagamentosPendentes ?? '—', 'Quantidade', 'amber'),
        item('contratos', 'Contratos aguardando conferência', raw.documents.contratos + raw.documents.assinaturas, 'Contratos/assinaturas', 'purple'),
      ], undefined, 'finance'),
      section('produtos-retorno', 'Produtos e Retorno', [
        item('retorno', 'Retornos registrados', raw.commercial.retornos, 'No mês', 'green'),
        item('garantias', 'Garantias vendidas', raw.commercial.garantias, 'No mês', 'purple'),
        item('produtos-fi', 'Produtos F&I', raw.financing.produtos, 'No mês', 'cyan'),
        item('fichas-aprovadas', 'Fichas aprovadas', raw.financing.aprovadas, 'No período', 'brand'),
      ], undefined, 'money'),
    ],
  }
}

function buildMarketing(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('leads', 'Leads gerados', raw.leads.total, 'Mês atual', 'brand', 'leads', '/marketing/sdr/inbox'),
      metric('sem-atendimento', 'Sem atendimento', raw.leads.semAtendimento, 'Aguardando SDR', raw.leads.semAtendimento > 0 ? 'amber' : 'gray', 'clock'),
      metric('convertidos', 'Convertidos em venda', raw.leads.convertidos, 'No período', 'green', 'check'),
      metric('vendas-marketing', 'Vendas do mês', raw.commercial.vendasTrocas, 'Resumo comercial', 'blue', 'sales'),
    ],
    sections: [
      section('origens', 'Canais e Origens', raw.leads.porOrigem.length ? raw.leads.porOrigem : [item('sem-origem', 'Sem origem registrada', 0)], undefined, 'leads'),
      section('funil', 'Funil de Leads', [
        item('novos', 'Leads novos', raw.leads.novos, 'Mês atual', 'brand'),
        item('em-atendimento', 'Em atendimento', raw.leads.emAtendimento, 'Ativos', 'blue'),
        item('perdidos', 'Leads perdidos', raw.leads.perdidos, 'No período', raw.leads.perdidos > 0 ? 'red' : 'gray'),
        item('sem-atendimento', 'Leads sem atendimento', raw.leads.semAtendimento, 'Fila', raw.leads.semAtendimento > 0 ? 'amber' : 'gray'),
      ], undefined, 'activity'),
      section('impacto', 'Impacto Comercial', [
        item('vendas', 'Vendas do mês', raw.commercial.vendasTrocas, 'Escopo permitido', 'brand'),
        item('ranking', 'Vendedor destaque', raw.ranking.tenantTop[0]?.label ?? '—', raw.ranking.tenantTop[0]?.helper, 'amber'),
        item('veiculos-leads', 'Veículo mais procurado', raw.leads.veiculoMaisProcurado ?? 'Sem dados suficientes', 'Leads com veículo de interesse no mês', 'slate', '/crm/leads'),
      ], undefined, 'sales'),
    ],
  }
}

function buildFi(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('fichas', 'Fichas enviadas', raw.financing.enviadas, 'Mês atual', 'brand', 'finance', '/financiamento/fichas'),
      metric('aprovadas', 'Aprovadas', raw.financing.aprovadas, 'No período', 'green', 'check', '/financiamento/aprovadas'),
      metric('recusadas', 'Recusadas', raw.financing.recusadas, 'No período', raw.financing.recusadas > 0 ? 'red' : 'gray', 'alert', '/financiamento/recusadas'),
      metric('pendentes', 'Pendentes', raw.financing.pendentes, 'Simulação/envio', raw.financing.pendentes > 0 ? 'amber' : 'gray', 'clock', '/financiamento/fichas'),
    ],
    sections: [
      section('bancos', 'Bancos e Aprovações', raw.financing.porBanco.length ? raw.financing.porBanco : [item('sem-banco', 'Sem fichas por banco', 0)], undefined, 'finance'),
      section('operacao-fi', 'Operação F&I', [
        item('simulacoes', 'Simulações abertas', raw.financing.simulacoes, 'Mês atual', 'blue'),
        item('docs', 'Documentos pendentes', raw.financing.docsPendentes, 'Propostas com documentos', raw.financing.docsPendentes > 0 ? 'amber' : 'gray'),
        item('produtos', 'Produtos agregados', raw.financing.produtos, 'No mês', 'purple'),
        item('retorno', 'Retorno estimado', raw.financing.retornoEstimado != null ? fmtCurrency(raw.financing.retornoEstimado) : '—', 'Conforme permissão', 'green'),
      ], undefined, 'documents'),
      section('comercial', 'Resumo Comercial', [
        item('vendas', 'Vendas do mês', raw.commercial.vendasTrocas, 'Escopo permitido', 'brand'),
        item('retorno', 'Retornos registrados', raw.commercial.retornos, 'Negociações', 'green'),
        item('ranking', 'Ranking resumido', raw.ranking.unitTop[0]?.label ?? raw.ranking.tenantTop[0]?.label ?? '—', raw.ranking.unitTop[0]?.helper ?? raw.ranking.tenantTop[0]?.helper, 'amber'),
      ], undefined, 'sales'),
    ],
  }
}

function buildSdr(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('leads-novos', 'Leads novos', raw.leads.novos, 'Mês atual', 'brand', 'leads', '/marketing/sdr/inbox'),
      metric('sem-atendimento', 'Sem atendimento', raw.leads.semAtendimento, 'Aguardando contato', raw.leads.semAtendimento > 0 ? 'amber' : 'gray', 'clock'),
      metric('meus-leads', 'Meus leads', raw.leads.meus, 'Atribuídos', 'blue', 'users'),
      metric('convertidos', 'Convertidos', raw.leads.convertidos, 'Venda/negociação', 'green', 'check'),
    ],
    sections: [
      section('atendimento', 'Atendimento SDR', [
        item('em-atendimento', 'Leads em atendimento', raw.leads.emAtendimento, 'Ativos', 'blue'),
        item('perdidos', 'Leads perdidos', raw.leads.perdidos, 'No período', raw.leads.perdidos > 0 ? 'red' : 'gray'),
        item('agendados', 'Visitas de hoje', raw.leads.visitasHoje, raw.leads.noShowMes > 0 ? `${raw.leads.noShowMes} não compareceram no mês` : 'Agenda do dia', raw.leads.visitasHoje > 0 ? 'blue' : 'gray', '/crm/atendimentos'),
        item('retornos', 'Retornos pendentes', raw.pendencies.atribuidas + raw.pendencies.vencendoHoje, 'Pendências atribuídas', 'amber'),
      ], undefined, 'leads'),
      section('performance', 'Performance SDR', [
        item('contatos', 'Contatos realizados', raw.leads.contatosMes, 'Ligações, WhatsApp e e-mails no mês', 'blue', '/crm/leads'),
        item('tempo-resposta', 'Tempo até o primeiro contato', raw.leads.tempoRespostaMin != null ? formatInsightValue(raw.leads.tempoRespostaMin, 'min') : 'Sem dados suficientes', 'Média dos últimos 30 dias', raw.leads.tempoRespostaMin != null && raw.leads.tempoRespostaMin > 15 ? 'amber' : 'gray', '/crm/leads'),
        item('ranking-sdr', 'Ranking SDR', raw.ranking.unitTop[0]?.label ?? '—', raw.ranking.unitTop[0]?.helper, 'amber'),
        item('conversao', 'Conversão para venda', raw.leads.total > 0 ? fmtPercent((raw.leads.convertidos / raw.leads.total) * 100) : '0%', 'Leads convertidos', 'green'),
      ], undefined, 'ranking'),
    ],
  }
}

function buildPurchases(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('avaliados', 'Veículos avaliados', raw.purchases.avaliados, 'Mês atual', 'brand', 'stock', '/estoque/avaliacoes'),
      metric('em-andamento', 'Avaliações em andamento', raw.purchases.emAndamento, 'Fila ativa', 'blue', 'activity'),
      metric('compras', 'Compras aprovadas', raw.purchases.comprados, 'Negociações finalizadas', 'green', 'check'),
      metric('pendencias', 'Pendências de compras', raw.pendencies.abertas, 'Escopo permitido', raw.pendencies.abertas > 0 ? 'amber' : 'gray', 'pendencies'),
    ],
    sections: [
      section('compras', 'Compras e Avaliações', [
        item('aprovados', 'Avaliações aprovadas', raw.purchases.aprovados, 'Liberadas/aprovadas', 'green'),
        item('pendentes', 'Avaliações pendentes', raw.purchases.pendentes, 'Aguardando decisão', 'amber'),
        item('trocas', 'Trocas em andamento', raw.purchases.trocas, 'Negociações abertas', 'blue'),
        item('estoque-previsto', 'Estoque previsto', raw.purchases.estoquePrevisto, 'Liberado no mês', 'brand'),
      ], undefined, 'stock'),
      section('operacao-compras', 'Operação de Compras', [
        item('vistoria', 'Vistorias pendentes', raw.documents.vistorias, 'Pendências', 'amber'),
        item('documentos', 'Documentos pendentes', raw.purchases.aguardandoDocumentacao, 'Compras/avaliações', 'purple'),
      ], undefined, 'documents'),
      stockSection(raw),
      prepSection(raw),
    ],
  }
}

function buildAuxiliary(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('atribuidas', 'Pendências atribuídas', raw.pendencies.atribuidas || raw.pendencies.minhas, 'Suas tarefas', 'brand', 'pendencies', '/pendencias/minhas'),
      metric('vencidas', 'Pendências vencidas', raw.pendencies.vencidas, 'Atenção imediata', raw.pendencies.vencidas > 0 ? 'red' : 'gray', 'alert', '/pendencias/minhas'),
      metric('hoje', 'Vencendo hoje', raw.pendencies.vencendoHoje, 'Tarefas do dia', raw.pendencies.vencendoHoje > 0 ? 'amber' : 'gray', 'clock', '/pendencias/minhas'),
      metric('documentos', 'Documentos pendentes', raw.documents.pendentes, 'Conferência', 'purple', 'documents', '/pendencias/minhas'),
    ],
    sections: [
      section('documentacao', 'Documentação', [
        item('contratos', 'Contratos pendentes', raw.documents.contratos, 'Aguardando contrato', 'purple'),
        item('assinaturas', 'Assinaturas pendentes', raw.documents.assinaturas, 'Aguardando assinatura', 'blue'),
        item('transferencias', 'Transferências pendentes', raw.documents.transferencias, 'Pendências abertas', 'amber'),
        item('entregas', 'Entregas pendentes', raw.documents.entregas, 'Aguardando entrega', 'brand'),
      ], undefined, 'documents'),
      section('tarefas', 'Tarefas do Dia', [
        item('atribuidas', 'Pendências atribuídas', raw.pendencies.atribuidas, 'Designadas para você', 'brand'),
        item('vistorias', 'Vistorias pendentes', raw.documents.vistorias, 'Operacional', 'amber'),
        item('aguardando-doc', 'Negociações aguardando documentação', raw.commercial.aguardandoDocumentacao, 'Negociações', 'purple'),
        item('avisos', 'Avisos importantes', raw.system.alertasSistema, 'Sistema/comunicação', raw.system.alertasSistema > 0 ? 'red' : 'gray'),
      ], undefined, 'clock'),
      opsSection(raw),
      deliveriesSection(raw),
      section('comercial-simples', 'Resumo Simples de Vendas', [
        item('vendas', 'Vendas do mês', raw.commercial.vendasTrocas, 'Sem dados sensíveis', 'brand'),
        item('ranking', 'Ranking resumido', raw.ranking.unitTop[0]?.label ?? '—', raw.ranking.unitTop[0]?.helper, 'amber'),
      ], undefined, 'sales'),
    ],
  }
}

function buildDashboard(raw: RawDashboardMetrics, profile: DashboardProfile): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  if (profile.kind === 'VENDEDOR') return buildSeller(raw)
  if (profile.kind === 'GERENTE') return buildManager(raw)
  if (profile.kind === 'GERENTE_GERAL') return buildGeneralManager(raw)
  if (profile.kind === 'ADMIN') return buildAdmin(raw)
  if (profile.kind === 'FINANCEIRO') return buildFinance(raw)
  if (profile.kind === 'MARKETING') return buildMarketing(raw)
  if (profile.kind === 'FI') return buildFi(raw)
  if (profile.kind === 'SDR') return buildSdr(raw)
  if (profile.kind === 'COMPRAS') return buildPurchases(raw)
  if (profile.kind === 'DOCUMENTACAO') return buildDocumentation(raw)
  if (profile.kind === 'PREPARACAO') return buildPreparation(raw)
  if (profile.kind === 'POS_VENDA') return buildPosVenda(raw)
  if (profile.kind === 'AUXILIAR') return buildAuxiliary(raw)
  return buildAuxiliary(raw)
}

export async function getDashboardData(user: SessionUser): Promise<DashboardSummary> {
  const { ctx, warnings } = await resolveDashboardContext(user)
  const { profile, services, access } = ctx

  const now = new Date()
  const { start, end } = monthRange(now)
  const today = todayRange(now)
  const empty = emptyRawDashboardMetrics()
  // Plano de carga: serviço contratado pela loja E liberado para o colaborador.
  // Não liberado = nem consulta (o dado nunca sai do servidor).
  const loadPlan = applyAccessToLoadPlan(resolveDashboardDataLoadPlan(services), access)
  // Blocos operacionais só para quem trabalha com eles (e tem acesso).
  const kind = profile.kind
  const isLeadership = kind === 'ADMIN' || kind === 'GERENTE_GERAL'
  const canSeeCost = access.canAny(['ops.costs.view']) || await financeCan(user, 'finance.profit').catch(() => false)
  const wants = {
    stock: loadPlan.stock && (isLeadership || kind === 'COMPRAS' || kind === 'PREPARACAO'),
    prep: loadPlan.stock && (isLeadership || kind === 'COMPRAS' || kind === 'PREPARACAO'),
    ops: access.canAny(['ops.panel', 'ops.transfer.view', 'ops.renave.view']) &&
      (isLeadership || kind === 'DOCUMENTACAO' || kind === 'AUXILIAR' || kind === 'FI'),
    deliveries: access.can('negotiations') &&
      (isLeadership || kind === 'POS_VENDA' || kind === 'DOCUMENTACAO' || kind === 'AUXILIAR'),
  }

  const [
    commercial,
    pendencies,
    goals,
    ranking,
    leads,
    financing,
    finance,
    purchases,
    documents,
    system,
    units,
    stock,
    prep,
    ops,
    deliveries,
  ] = await Promise.all([
    loadPlan.commercial ? loadCommercial(ctx, start, end) : Promise.resolve(empty.commercial),
    loadPlan.pendencies ? loadPendencies(ctx, now, today.start, today.end) : Promise.resolve(empty.pendencies),
    loadPlan.goals ? loadGoals(ctx) : Promise.resolve(empty.goals),
    loadPlan.ranking && profile.canSeeRanking ? loadRanking(ctx) : Promise.resolve(empty.ranking),
    loadPlan.leads ? loadLeads(ctx, start, end, today.start, today.end) : Promise.resolve(empty.leads),
    loadPlan.financing ? loadFinancing(ctx, start, end) : Promise.resolve(empty.financing),
    loadPlan.finance && profile.canSeeFinancial ? loadFinance(ctx, start, end) : Promise.resolve(empty.finance),
    loadPlan.purchases ? loadPurchases(ctx, start, end) : Promise.resolve(empty.purchases),
    loadPlan.documents ? loadDocuments(ctx) : Promise.resolve(empty.documents),
    loadPlan.system ? loadSystem(ctx) : Promise.resolve(empty.system),
    loadPlan.units ? loadUnits(ctx, start, end) : Promise.resolve(empty.units),
    wants.stock ? loadStock(ctx, canSeeCost, access.canAny(['marketing.publications', 'site'])) : Promise.resolve(empty.stock),
    wants.prep ? loadPreparation(ctx, now, today.start, today.end, start, end, canSeeCost) : Promise.resolve(empty.prep),
    wants.ops ? loadOperations(ctx) : Promise.resolve(empty.ops),
    wants.deliveries ? loadDeliveries(ctx, today.start, today.end, start, end) : Promise.resolve(empty.deliveries),
  ])

  const raw: RawDashboardMetrics = {
    commercial,
    pendencies,
    goals,
    ranking,
    leads,
    financing,
    finance,
    purchases,
    documents,
    system,
    units,
    stock,
    prep,
    ops,
    deliveries,
  }
  const roleDashboard = buildDashboard(raw, profile)
  const common = filterDashboardSection(commonSection(raw, profile), services, access) ?? section(
    'servicos-indisponiveis',
    'Serviços disponíveis',
    [],
    'Nenhum widget ativo para os serviços habilitados neste perfil.',
    'system',
  )

  return {
    profile,
    services,
    period: {
      label: 'Mês atual',
      start: start.toISOString(),
      end: end.toISOString(),
    },
    highlights: filterDashboardMetrics(roleDashboard.highlights, services, access),
    sections: filterDashboardSections(roleDashboard.sections, services, access),
    commonSection: common,
    warnings,
  }
}
