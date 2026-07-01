import type {
  DealStatus,
  FinanceProposalStatus,
  PendencyStatus,
  Prisma,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { UserRole } from '@/lib/permissions'
import type { SessionUser } from '@/lib/auth-guards'
import { assertTenantId } from '@/lib/auth-guards'
import { aggregateAchieved, type AggregationScope } from '@/lib/goals/aggregators'
import { computeRanking } from '@/lib/ranking/service'
import { num } from '@/lib/finance/finance-service'
import { resolveDashboardProfile } from '@/lib/dashboard/dashboardProfiles'
import {
  filterDashboardMetrics,
  filterDashboardSection,
  filterDashboardSections,
  resolveDashboardDataLoadPlan,
} from '@/lib/dashboard/dashboardWidgets'
import type {
  DashboardListItem,
  DashboardMetric,
  DashboardProfile,
  DashboardSection,
  DashboardSummary,
} from '@/lib/dashboard/types'
import { getTenantServicesForUser } from '@/lib/tenant-services/resolveTenantServices'
import type { TenantServiceKey } from '@/lib/tenant-services/types'

const NO_MATCH = '__dashboard_no_match__'

const DONE_DEALS: DealStatus[] = ['FINALIZADA', 'ENTREGUE']
const APPROVED_DEALS: DealStatus[] = [
  'APROVADA',
  'LIBERADA',
  'FINANCEIRO_APROVADO',
  'DOCUMENTACAO_CONCLUIDA',
  'ASSINADA',
  'FINALIZADA',
  'ENTREGUE',
]
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

interface DashboardContext {
  user: SessionUser
  profile: DashboardProfile
  tenantId: string | null
  unitId: string | null
  sellerId: string | null
  managerId: string | null
}

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
  }
}

function monthRange(now: Date) {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  }
}

function todayRange(now: Date) {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  }
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

function fmtPercent(value: number): string {
  return `${Math.round(value)}%`
}

function tenantFilter(ctx: DashboardContext): Prisma.DealWhereInput {
  return ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }
}

function scopedDealWhere(ctx: DashboardContext, extra: Prisma.DealWhereInput = {}): Prisma.DealWhereInput {
  const where: Prisma.DealWhereInput = { ...tenantFilter(ctx), ...extra }

  if (ctx.profile.scope === 'SELF') {
    where.sellerId = ctx.sellerId ?? NO_MATCH
    return where
  }

  if (ctx.profile.scope === 'UNIT') {
    where.unitId = ctx.unitId ?? NO_MATCH
  }

  return where
}

function scopedPendencyWhere(ctx: DashboardContext, extra: Prisma.PendencyWhereInput = {}): Prisma.PendencyWhereInput {
  const where: Prisma.PendencyWhereInput = {
    ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
    ...extra,
  }

  if (ctx.profile.scope === 'SELF') {
    where.OR = [
      { responsibleId: ctx.sellerId ?? NO_MATCH },
      { assignedUserId: ctx.user.id },
    ]
    return where
  }

  if (ctx.profile.scope === 'UNIT') {
    where.unitId = ctx.unitId ?? NO_MATCH
  }

  return where
}

function scopedLeadWhere(ctx: DashboardContext, extra: Prisma.MarketingLeadWhereInput = {}): Prisma.MarketingLeadWhereInput {
  const where: Prisma.MarketingLeadWhereInput = {
    ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }),
    ...extra,
  }

  if (ctx.profile.scope === 'SELF' || ctx.profile.kind === 'SDR') {
    where.OR = [
      { assignedToUserId: ctx.user.id },
      { claimedByUserId: ctx.user.id },
    ]
    return where
  }

  if (ctx.profile.scope === 'UNIT') {
    where.unitId = ctx.unitId ?? NO_MATCH
  }

  return where
}

function scopedFinanceProposalWhere(ctx: DashboardContext, extra: Prisma.FinanceProposalWhereInput = {}): Prisma.FinanceProposalWhereInput {
  const where: Prisma.FinanceProposalWhereInput = {
    ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
    ...extra,
  }

  if (ctx.profile.scope === 'SELF') {
    where.sellerId = ctx.user.id
  }

  if (ctx.profile.scope === 'UNIT') {
    where.deal = { unitId: ctx.unitId ?? NO_MATCH }
  }

  return where
}

function scopedFinancialWhere(ctx: DashboardContext, extra: Prisma.FinancialEntryWhereInput = {}): Prisma.FinancialEntryWhereInput {
  const where: Prisma.FinancialEntryWhereInput = {
    ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId }),
    ...extra,
  }

  if (ctx.profile.scope === 'UNIT') {
    where.unitId = ctx.unitId ?? NO_MATCH
  }

  return where
}

function aggregationScope(ctx: DashboardContext): AggregationScope {
  return {
    tenantId: ctx.user.role === 'MASTER' ? null : ctx.tenantId,
    unitId: ctx.profile.scope === 'UNIT' ? ctx.unitId : null,
    sellerId: ctx.profile.scope === 'SELF' ? ctx.sellerId ?? NO_MATCH : null,
  }
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

async function loadActorContext(user: SessionUser) {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      position: { select: { name: true, slug: true } },
      unit: { select: { name: true } },
      seller: {
        select: {
          id: true,
          cargo: true,
          unitId: true,
          managerId: true,
          position: { select: { name: true, slug: true } },
        },
      },
      manager: {
        select: {
          id: true,
          accessProfile: true,
          unitId: true,
          position: { select: { name: true, slug: true } },
        },
      },
    },
  })

  const isSdrMember = user.tenantId
    ? await prisma.marketingSdrMember.count({
      where: { tenantId: user.tenantId, userId: user.id, active: true },
    }).then((count) => count > 0)
    : false

  const positionName =
    dbUser?.position?.name ??
    dbUser?.seller?.position?.name ??
    dbUser?.manager?.position?.name ??
    dbUser?.seller?.cargo ??
    dbUser?.manager?.accessProfile ??
    null

  const positionSlug =
    dbUser?.position?.slug ??
    dbUser?.seller?.position?.slug ??
    dbUser?.manager?.position?.slug ??
    null

  return {
    dbUser,
    isSdrMember,
    positionName,
    positionSlug,
  }
}

async function loadCommercial(ctx: DashboardContext, start: Date, end: Date) {
  const scope = aggregationScope(ctx)
  const window = { start, end }
  const completedThisMonth = scopedDealWhere(ctx, {
    status: { in: DONE_DEALS },
    OR: [
      { finalizedAt: { gte: start, lte: end } },
      { finalizedAt: null, saleDate: { gte: start, lte: end } },
      { finalizedAt: null, saleDate: null, createdAt: { gte: start, lte: end } },
    ],
  })

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
    prisma.deal.count({ where: scopedDealWhere(ctx, { type: 'CONSIGNACAO', ...completedThisMonth }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: OPEN_DEALS } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: APPROVED_DEALS }, createdAt: { gte: start, lte: end } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: LOST_DEALS }, updatedAt: { gte: start, lte: end } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: { in: ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'] } }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'AGUARDANDO_FINANCEIRO' }) }),
    prisma.deal.count({ where: scopedDealWhere(ctx, { status: 'AGUARDANDO_DOCUMENTACAO' }) }),
    prisma.deal.aggregate({
      where: completedThisMonth,
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
  const [minhas, unidade, tenant] = await Promise.all([
    prisma.goal.count({ where: { ...tenantPart, status: 'ATIVA', active: true, scope: 'USER', userId: ctx.user.id } }),
    prisma.goal.count({ where: { ...tenantPart, status: 'ATIVA', active: true, scope: 'UNIT', unitId: ctx.unitId ?? NO_MATCH } }),
    prisma.goal.count({ where: { ...tenantPart, status: 'ATIVA', active: true, scope: 'TENANT' } }),
  ])

  return { minhas, unidade, tenant }
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

async function loadLeads(ctx: DashboardContext, start: Date, end: Date) {
  const monthWhere = scopedLeadWhere(ctx, { createdAt: { gte: start, lte: end } })
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
    prisma.marketingLead.count({ where: { ...(ctx.user.role === 'MASTER' ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }), assignedToUserId: ctx.user.id } }),
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
      .map((row) => item(`origem-${row.source ?? 'sem'}`, row.source || 'Sem origem', row._count._all, 'Leads no mês'))
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, 5),
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
    prisma.deal.count({ where: scopedDealWhere(ctx, { type: 'COMPRA', status: { in: DONE_DEALS }, createdAt: { gte: start, lte: end } }) }),
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
      status: { in: DONE_DEALS },
      OR: [
        { finalizedAt: { gte: start, lte: end } },
        { finalizedAt: null, saleDate: { gte: start, lte: end } },
      ],
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
        item('sem-atividade', 'Vendedores sem atividade', '—', 'Dados ainda não disponíveis', 'gray'),
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

function buildGeneralManager(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('vendas-tenant', 'Vendas totais', raw.commercial.vendasTrocas, 'Tenant no mês', 'brand', 'sales', '/negociacoes'),
      metric('unidades', 'Unidades ativas', raw.system.unidades, 'Tenant', 'blue', 'users', '/cadastros/unidades'),
      metric('pendencias-vencidas', 'Pendências vencidas', raw.pendencies.vencidas, 'Tenant', raw.pendencies.vencidas > 0 ? 'red' : 'gray', 'alert', '/relatorios/pendencias/sla'),
      metric('valor-vendido', 'Valor vendido', fmtCurrency(raw.commercial.valorVendido), 'Mês atual', 'green', 'money', '/relatorios/financeiro/visao-geral'),
    ],
    sections: [
      section('unidades', 'Unidades', raw.units.length ? raw.units : [item('sem-unidade', 'Sem vendas por unidade', 0, 'No mês')], undefined, 'users'),
      section('ranking-geral', 'Ranking Geral', raw.ranking.tenantTop, 'Vendedores do tenant.', 'ranking'),
      section('gargalos', 'Gargalos Operacionais', [
        item('financeiro', 'Aguardando financeiro', raw.commercial.aguardandoFinanceiro, 'Negociações', raw.commercial.aguardandoFinanceiro > 0 ? 'amber' : 'gray'),
        item('documentacao', 'Aguardando documentação', raw.commercial.aguardandoDocumentacao + raw.documents.pendentes, 'Negociações + pendências', 'purple'),
        item('fi', 'F&I pendente', raw.financing.pendentes, 'Fichas/simulações', 'cyan'),
        item('leads', 'Leads sem atendimento', raw.leads.semAtendimento, 'Marketing/SDR', raw.leads.semAtendimento > 0 ? 'amber' : 'gray'),
      ], undefined, 'alert'),
    ],
  }
}

function buildAdmin(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('status-geral', 'Status geral', raw.system.pendenciasCriticas > 0 ? 'Atenção' : 'Operando', 'Tenant/plataforma', raw.system.pendenciasCriticas > 0 ? 'red' : 'green', 'system'),
      metric('vendas', 'Vendas totais', raw.commercial.vendasTrocas, 'Mês atual', 'brand', 'sales'),
      metric('usuarios', 'Usuários ativos', raw.system.usuariosAtivos, 'Com acesso ativo', 'blue', 'users'),
      metric('alertas', 'Alertas do sistema', raw.system.alertasSistema, 'Não lidos', raw.system.alertasSistema > 0 ? 'red' : 'gray', 'alert'),
    ],
    sections: [
      section('financeiro', 'Financeiro e Gestão', [
        item('receitas', 'Receitas recebidas', raw.finance ? fmtCurrency(raw.finance.receitas) : '—', 'Mês atual', 'green'),
        item('a-receber', 'Valores a receber', raw.finance ? fmtCurrency(raw.finance.aReceber) : '—', 'Previstos', 'blue'),
        item('comissoes', 'Comissões a validar', raw.finance ? fmtCurrency(raw.finance.comissoesPendentes) : '—', 'Previstas/aprovadas', 'amber'),
        item('produtos', 'Produtos/garantias', raw.financing.produtos + raw.commercial.garantias, 'Vendidos no mês', 'purple'),
      ], undefined, 'money'),
      section('operacao', 'Operação', [
        item('pendencias', 'Pendências críticas', raw.pendencies.criticas, 'Tenant', raw.pendencies.criticas > 0 ? 'red' : 'gray'),
        item('travadas', 'Negociações travadas', raw.commercial.aguardandoAprovacao + raw.commercial.aguardandoFinanceiro + raw.commercial.aguardandoDocumentacao, 'Aprovação/financeiro/documentação', 'amber'),
        item('usuarios', 'Usuários ativos', raw.system.usuariosAtivos, 'Operação ativa', 'blue'),
        item('unidades', 'Status das unidades', raw.system.unidades, 'Unidades ativas', 'green'),
      ], undefined, 'activity'),
      section('sistema', 'Sistema', [
        item('avisos', 'Alertas recentes', raw.system.alertasSistema, 'Sistema/integração/envio', raw.system.alertasSistema > 0 ? 'red' : 'gray'),
        item('integracoes', 'Integrações', '—', 'Dados ainda não disponíveis', 'gray'),
        item('push', 'Push/avisos', raw.pendencies.criticas + raw.system.alertasSistema, 'Atenções abertas', 'amber'),
      ], undefined, 'system'),
    ],
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
        item('veiculos-leads', 'Veículos com mais leads', '—', 'Dados ainda não disponíveis', 'gray'),
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
        item('agendados', 'Agendamentos do dia', '—', 'Dados ainda não disponíveis', 'gray'),
        item('retornos', 'Retornos pendentes', raw.pendencies.atribuidas + raw.pendencies.vencendoHoje, 'Pendências atribuídas', 'amber'),
      ], undefined, 'leads'),
      section('performance', 'Performance SDR', [
        item('contatos', 'Contatos realizados', '—', 'Integração de telefonia em evolução', 'gray'),
        item('tempo-resposta', 'Tempo médio de resposta', '—', 'Dados ainda não disponíveis', 'gray'),
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
        item('origem', 'Origem das compras', '—', 'Dados ainda não disponíveis', 'gray'),
        item('responsavel', 'Responsável pela compra', '—', 'Dados ainda não disponíveis', 'gray'),
      ], undefined, 'documents'),
    ],
  }
}

function buildAuxiliary(raw: RawDashboardMetrics): { highlights: DashboardMetric[]; sections: DashboardSection[] } {
  return {
    highlights: [
      metric('atribuidas', 'Pendências atribuídas', raw.pendencies.atribuidas || raw.pendencies.minhas, 'Suas tarefas', 'brand', 'pendencies', '/pendencias/minhas'),
      metric('vencidas', 'Pendências vencidas', raw.pendencies.vencidas, 'Atenção imediata', raw.pendencies.vencidas > 0 ? 'red' : 'gray', 'alert'),
      metric('hoje', 'Vencendo hoje', raw.pendencies.vencendoHoje, 'Tarefas do dia', raw.pendencies.vencendoHoje > 0 ? 'amber' : 'gray', 'clock'),
      metric('documentos', 'Documentos pendentes', raw.documents.pendentes, 'Conferência', 'purple', 'documents'),
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
  if (profile.kind === 'AUXILIAR') return buildAuxiliary(raw)
  return buildAuxiliary(raw)
}

export async function getDashboardData(user: SessionUser): Promise<DashboardSummary> {
  const tenantId = assertTenantId(user.tenantId, user.role)
  const [actor, tenantServices] = await Promise.all([
    loadActorContext(user),
    getTenantServicesForUser(user),
  ])
  const effectiveUnitId = user.unitId ?? actor.dbUser?.seller?.unitId ?? actor.dbUser?.manager?.unitId ?? null
  const baseProfile = resolveDashboardProfile({
    role: user.role as UserRole,
    positionName: actor.positionName,
    positionSlug: actor.positionSlug,
    sellerCargo: actor.dbUser?.seller?.cargo,
    managerAccessProfile: actor.dbUser?.manager?.accessProfile,
    unitName: actor.dbUser?.unit?.name ?? null,
    isSdrMember: actor.isSdrMember,
  })
  const services = tenantServices.flags
  const profile: DashboardProfile = {
    ...baseProfile,
    canSeeFinancial: baseProfile.canSeeFinancial && services.financeiro,
    canSeeRanking: baseProfile.canSeeRanking && services.ranking,
  }

  const ctx: DashboardContext = {
    user,
    profile,
    tenantId,
    unitId: effectiveUnitId,
    sellerId: actor.dbUser?.seller?.id ?? null,
    managerId: actor.dbUser?.manager?.id ?? null,
  }

  const warnings: string[] = []
  if (profile.scope === 'UNIT' && !effectiveUnitId) {
    warnings.push('Usuário sem unidade vinculada. Alguns blocos foram limitados para evitar vazamento de dados.')
  }
  if (profile.scope === 'SELF' && !ctx.sellerId) {
    warnings.push('Usuário sem cadastro de vendedor vinculado. Métricas individuais podem ficar zeradas.')
  }
  if (!Object.values(services).some(Boolean)) {
    warnings.push('Nenhum serviço ativo foi encontrado para este usuário. O dashboard foi mantido sem blocos de módulos.')
  }

  const now = new Date()
  const { start, end } = monthRange(now)
  const today = todayRange(now)
  const empty = emptyRawDashboardMetrics()
  const loadPlan = resolveDashboardDataLoadPlan(services)

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
  ] = await Promise.all([
    loadPlan.commercial ? loadCommercial(ctx, start, end) : Promise.resolve(empty.commercial),
    loadPlan.pendencies ? loadPendencies(ctx, now, today.start, today.end) : Promise.resolve(empty.pendencies),
    loadPlan.goals ? loadGoals(ctx) : Promise.resolve(empty.goals),
    loadPlan.ranking && profile.canSeeRanking ? loadRanking(ctx) : Promise.resolve(empty.ranking),
    loadPlan.leads ? loadLeads(ctx, start, end) : Promise.resolve(empty.leads),
    loadPlan.financing ? loadFinancing(ctx, start, end) : Promise.resolve(empty.financing),
    loadPlan.finance && profile.canSeeFinancial ? loadFinance(ctx, start, end) : Promise.resolve(empty.finance),
    loadPlan.purchases ? loadPurchases(ctx, start, end) : Promise.resolve(empty.purchases),
    loadPlan.documents ? loadDocuments(ctx) : Promise.resolve(empty.documents),
    loadPlan.system ? loadSystem(ctx) : Promise.resolve(empty.system),
    loadPlan.units ? loadUnits(ctx, start, end) : Promise.resolve(empty.units),
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
  }
  const roleDashboard = buildDashboard(raw, profile)
  const common = filterDashboardSection(commonSection(raw, profile), services) ?? section(
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
    highlights: filterDashboardMetrics(roleDashboard.highlights, services),
    sections: filterDashboardSections(roleDashboard.sections, services),
    commonSection: common,
    warnings,
  }
}
