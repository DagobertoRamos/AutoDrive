import type { DashboardIcon, DashboardListItem, DashboardMetric, DashboardSection } from '@/lib/dashboard/types'
import { hasTenantService, type TenantServiceFlags, type TenantServiceKey } from '@/lib/tenant-services/types'
import type { Module } from '@/lib/permissions'
import type { DashboardAccess } from '@/lib/dashboard/access'

export interface DashboardWidgetDescriptor {
  id: string
  kind: 'metric' | 'item' | 'section' | 'panel'
  label?: string
  title?: string
  href?: string
  icon?: DashboardIcon
  services?: TenantServiceKey[]
}

export interface DashboardDataLoadPlan {
  commercial: boolean
  pendencies: boolean
  goals: boolean
  ranking: boolean
  leads: boolean
  financing: boolean
  finance: boolean
  purchases: boolean
  documents: boolean
  system: boolean
  units: boolean
  stock: boolean
}

const SERVICE_BY_TEXT: Array<{ pattern: RegExp; services: TenantServiceKey[] }> = [
  { pattern: /ranking|posicao|posição|desempenho|trophy/i, services: ['ranking'] },
  { pattern: /meta|target/i, services: ['metas'] },
  { pattern: /lead|sdr|marketing|campanha|origem|funil|conversao/i, services: ['marketing', 'sdr'] },
  { pattern: /telefonia|chamada|gravacao|phone|contato/i, services: ['telefonia'] },
  { pattern: /financeiro|receita|recebimento|pagamento|pagar|receber|caixa|money|wallet/i, services: ['financeiro'] },
  { pattern: /comiss/i, services: ['comissoes'] },
  { pattern: /f&i|financiamento|ficha|banco|simulacao|simulação|aprovada|recusada|retorno/i, services: ['fi'] },
  { pattern: /garantia/i, services: ['garantias'] },
  { pattern: /produto|servico|serviço/i, services: ['produtosServicos'] },
  { pattern: /compra|avaliacao|avaliação|avaliados|estoque|stock|troca/i, services: ['compras', 'estoque'] },
  { pattern: /document|contrato|assinatura|entrega|vistoria|transferencia/i, services: ['documentacao'] },
  { pattern: /pendenc|gargalo|alert|sla|vencid|vencendo|tarefa/i, services: ['pendencias'] },
  { pattern: /venda|negociac|negociaç|proposta|comercial|valor vendido|sales/i, services: ['negociacoes'] },
  { pattern: /aviso|alertas|push|comunicacao|whatsapp|chat|megaphone/i, services: ['avisos', 'whatsappChat'] },
  { pattern: /integrac/i, services: ['integracoes'] },
  { pattern: /relatorio|comparativo|unidade destaque|unidades/i, services: ['relatorios'] },
  { pattern: /status|sistema|usuarios|usuários|system/i, services: ['avisos', 'integracoes', 'relatorios'] },
  { pattern: /ia|bot/i, services: ['ia'] },
]

const SERVICE_BY_HREF: Array<{ prefix: string; services: TenantServiceKey[] }> = [
  { prefix: '/estoque', services: ['estoque', 'compras'] },
  { prefix: '/negociacoes', services: ['negociacoes'] },
  { prefix: '/financeiro', services: ['financeiro'] },
  { prefix: '/financiamento', services: ['fi'] },
  { prefix: '/marketing', services: ['marketing', 'sdr'] },
  { prefix: '/pendencias', services: ['pendencias'] },
  { prefix: '/documentos', services: ['documentacao'] },
  { prefix: '/comissoes', services: ['comissoes'] },
  { prefix: '/ranking', services: ['ranking'] },
  { prefix: '/desempenho', services: ['ranking'] },
  { prefix: '/metas', services: ['metas'] },
  { prefix: '/vendedor-da-vez', services: ['vendedorDaVez'] },
  { prefix: '/relatorios', services: ['relatorios'] },
  { prefix: '/comunicacao', services: ['avisos', 'whatsappChat'] },
]

const EXPLICIT_WIDGET_SERVICES: Record<string, TenantServiceKey[]> = {
  'metric:minhas-vendas': ['negociacoes'],
  'metric:minhas-metas': ['metas'],
  'metric:minhas-pendencias': ['pendencias'],
  'metric:posicao-ranking': ['ranking'],
  'metric:vendas-unidade': ['negociacoes'],
  'metric:propostas-andamento': ['negociacoes'],
  'metric:pendencias-criticas': ['pendencias'],
  'metric:ranking-equipe': ['ranking'],
  'metric:vendas-tenant': ['negociacoes'],
  'metric:unidades': ['relatorios'],
  'metric:valor-vendido': ['financeiro'],
  'metric:status-geral': ['avisos', 'integracoes', 'relatorios'],
  'metric:vendas': ['negociacoes'],
  'metric:usuarios': ['relatorios'],
  'metric:alertas': ['avisos'],
  'metric:a-receber': ['financeiro'],
  'metric:a-pagar': ['financeiro'],
  'metric:comissoes': ['comissoes'],
  'metric:divergencias': ['financeiro', 'pendencias'],
  'metric:leads': ['marketing', 'sdr'],
  'metric:sem-atendimento': ['marketing', 'sdr'],
  'metric:convertidos': ['marketing', 'sdr'],
  'metric:vendas-marketing': ['negociacoes'],
  'metric:fichas': ['fi'],
  'metric:aprovadas': ['fi'],
  'metric:recusadas': ['fi'],
  'metric:pendentes': ['fi'],
  'metric:leads-novos': ['marketing', 'sdr'],
  'metric:meus-leads': ['marketing', 'sdr'],
  'metric:avaliados': ['compras', 'estoque'],
  'metric:em-andamento': ['compras', 'estoque'],
  'metric:compras': ['compras', 'estoque'],
  'metric:atribuidas': ['pendencias'],
  'metric:vencidas': ['pendencias'],
  'metric:hoje': ['pendencias'],
  'metric:documentos': ['documentacao'],
  'section:resumo-comercial': ['negociacoes', 'metas', 'ranking', 'pendencias'],
  'section:minha-performance': ['negociacoes', 'compras', 'garantias', 'produtosServicos', 'fi'],
  'section:trabalho-dia': ['marketing', 'sdr', 'negociacoes', 'pendencias'],
  'section:ranking': ['ranking'],
  'section:equipe': ['ranking', 'marketing', 'sdr'],
  'section:operacao-unidade': ['negociacoes', 'pendencias', 'documentacao', 'financeiro'],
  'section:comparativo': ['relatorios', 'negociacoes', 'garantias', 'produtosServicos'],
  'section:unidades': ['relatorios', 'negociacoes'],
  'section:ranking-geral': ['ranking'],
  'section:gargalos': ['financeiro', 'documentacao', 'fi', 'marketing', 'sdr', 'pendencias', 'negociacoes'],
  'section:financeiro': ['financeiro', 'comissoes', 'produtosServicos', 'garantias'],
  'section:operacao': ['pendencias', 'negociacoes', 'relatorios'],
  'section:sistema': ['avisos', 'integracoes', 'whatsappChat'],
  'section:produtos-retorno': ['fi', 'garantias', 'produtosServicos', 'negociacoes'],
  'section:origens': ['marketing', 'sdr'],
  'section:funil': ['marketing', 'sdr'],
  'section:impacto': ['marketing', 'sdr', 'negociacoes', 'ranking'],
  'section:bancos': ['fi'],
  'section:operacao-fi': ['fi', 'documentacao', 'produtosServicos'],
  'section:comercial': ['negociacoes', 'fi', 'ranking'],
  'section:atendimento': ['sdr', 'marketing', 'pendencias'],
  'section:performance': ['sdr', 'marketing', 'telefonia', 'ranking'],
  'section:compras': ['compras', 'estoque'],
  'section:operacao-compras': ['compras', 'documentacao', 'estoque'],
  'section:documentacao': ['documentacao'],
  'section:tarefas': ['pendencias', 'documentacao', 'negociacoes', 'avisos'],
  'section:comercial-simples': ['negociacoes', 'ranking'],
}

function uniqueServices(services: TenantServiceKey[]): TenantServiceKey[] {
  return [...new Set(services)]
}

export function resolveDashboardWidgetServices(widget: DashboardWidgetDescriptor): TenantServiceKey[] {
  if (widget.services?.length) return widget.services
  const explicit = EXPLICIT_WIDGET_SERVICES[`${widget.kind}:${widget.id}`] ?? EXPLICIT_WIDGET_SERVICES[widget.id]
  if (explicit?.length) return explicit

  const fromHref = widget.href
    ? SERVICE_BY_HREF.find(({ prefix }) => widget.href?.startsWith(prefix))?.services
    : undefined
  if (fromHref?.length) return fromHref

  const haystack = [
    widget.id,
    widget.label,
    widget.title,
    widget.href,
    widget.icon,
  ].filter(Boolean).join(' ')

  const matches = SERVICE_BY_TEXT
    .filter(({ pattern }) => pattern.test(haystack))
    .flatMap(({ services }) => services)

  return uniqueServices(matches)
}

// ── Permissão do COLABORADOR por widget ──────────────────────────────────────
// Além do serviço contratado pela loja, o widget só aparece se o colaborador
// tem o módulo liberado (papel + liberação/bloqueio individual). Basta UM.
export const CRM_MODULES: Module[] = ['crm', 'crm.view.own', 'crm.view.unit', 'crm.view.all', 'marketing', 'marketing.sdr']

const MODULES_BY_HREF: Array<{ prefix: string; modules: Module[] }> = [
  { prefix: '/negociacoes/aprovacoes', modules: ['negotiations.approve'] },
  { prefix: '/negociacoes', modules: ['negotiations'] },
  { prefix: '/financeiro', modules: ['finance'] },
  { prefix: '/relatorios/financeiro', modules: ['finance'] },
  { prefix: '/financiamento', modules: ['financing'] },
  { prefix: '/comissoes', modules: ['commissions'] },
  { prefix: '/ranking', modules: ['ranking'] },
  { prefix: '/desempenho', modules: ['ranking'] },
  { prefix: '/metas', modules: ['goals'] },
  { prefix: '/marketing/publicacoes', modules: ['marketing.publications'] },
  { prefix: '/marketing', modules: CRM_MODULES },
  { prefix: '/crm', modules: CRM_MODULES },
  { prefix: '/estoque/avaliacoes', modules: ['stock.evaluate'] },
  { prefix: '/estoque', modules: ['stock.view'] },
  { prefix: '/relatorios/estoque', modules: ['stock.view'] },
  { prefix: '/pendencias/central', modules: ['pendencies.central', 'pendencies.manage', 'pendencies'] },
  { prefix: '/pendencias/gerencia', modules: ['pendencies.manage'] },
  { prefix: '/pendencias', modules: ['pendencies'] },
  { prefix: '/relatorios/pendencias', modules: ['pendencies.manage', 'logs'] },
  { prefix: '/operacoes', modules: ['ops.panel', 'ops.transfer.view', 'ops.renave.view'] },
  { prefix: '/documentos', modules: ['documents'] },
  { prefix: '/cadastros/unidades', modules: ['registrations.units'] },
  { prefix: '/vendedor-da-vez', modules: ['sellerQueue.view'] },
]

const MODULES_BY_WIDGET: Record<string, Module[]> = {
  'section:financeiro': ['finance'],
  'section:produtos-retorno': ['finance', 'financing'],
  'section:bancos': ['financing'],
  'section:operacao-fi': ['financing'],
  'section:origens': CRM_MODULES,
  'section:funil': CRM_MODULES,
  'section:atendimento': CRM_MODULES,
  'section:performance': CRM_MODULES,
  'section:ranking': ['ranking'],
  'section:ranking-geral': ['ranking'],
  'section:compras': ['stock.evaluate', 'stock.view'],
  'section:operacao-compras': ['stock.evaluate', 'stock.view'],
  'section:estoque': ['stock.view'],
  'metric:valor-vendido': ['negotiations'],
  'metric:a-receber': ['finance'],
  'metric:a-pagar': ['finance'],
  'metric:comissoes': ['commissions', 'finance'],
  'item:receitas': ['finance'],
  'item:a-receber': ['finance'],
  'item:comissoes': ['commissions', 'finance'],
  'item:retorno': ['financing', 'finance'],
  'item:valor-imobilizado': ['ops.costs.view', 'finance.profit'],
}

export function resolveDashboardWidgetModules(widget: DashboardWidgetDescriptor): Module[] {
  const explicit = MODULES_BY_WIDGET[`${widget.kind}:${widget.id}`]
  if (explicit) return explicit
  const href = widget.href
  if (href) {
    const fromHref = MODULES_BY_HREF.find(({ prefix }) => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`))
    if (fromHref) return fromHref.modules
  }
  return []
}

export function canRenderDashboardWidget(
  widget: DashboardWidgetDescriptor,
  services: TenantServiceFlags,
  access?: DashboardAccess,
): boolean {
  const requiredServices = resolveDashboardWidgetServices(widget)
  if (requiredServices.length > 0 && !hasTenantService(services, requiredServices)) return false
  if (!access) return true
  return access.canAny(resolveDashboardWidgetModules(widget))
}

/** Plano de carga limitado ao que o colaborador pode ver — nem consulta o resto. */
export function applyAccessToLoadPlan(plan: DashboardDataLoadPlan, access: DashboardAccess): DashboardDataLoadPlan {
  return {
    ...plan,
    commercial: plan.commercial && access.canAny(['negotiations', 'goals', 'ranking', 'commissions', 'dashboard']),
    pendencies: plan.pendencies && access.can('pendencies'),
    goals: plan.goals && access.can('goals'),
    ranking: plan.ranking && access.can('ranking'),
    leads: plan.leads && access.canAny(CRM_MODULES),
    financing: plan.financing && access.can('financing'),
    finance: plan.finance && access.can('finance'),
    purchases: plan.purchases && access.canAny(['stock.evaluate', 'stock.view']),
    documents: plan.documents && access.canAny(['documents', 'ops.panel', 'ops.transfer.view', 'negotiations']),
    stock: plan.stock && access.can('stock.view'),
  }
}

export function resolveDashboardDataLoadPlan(services: TenantServiceFlags): DashboardDataLoadPlan {
  const commercial = hasTenantService(services, [
    'negociacoes',
    'compras',
    'garantias',
    'produtosServicos',
    'comissoes',
    'metas',
    'ranking',
    'financeiro',
    'fi',
    'relatorios',
  ])

  return {
    commercial,
    pendencies: services.pendencias,
    goals: services.metas,
    ranking: services.ranking,
    leads: hasTenantService(services, ['marketing', 'sdr']),
    financing: hasTenantService(services, ['fi', 'garantias', 'produtosServicos']),
    finance: services.financeiro,
    purchases: hasTenantService(services, ['compras', 'estoque']),
    documents: services.documentacao,
    system: hasTenantService(services, ['avisos', 'integracoes', 'whatsappChat', 'relatorios']),
    units: hasTenantService(services, ['negociacoes', 'relatorios']),
    stock: services.estoque,
  }
}

function itemDescriptor(item: DashboardListItem): DashboardWidgetDescriptor {
  return {
    id: item.id,
    kind: 'item',
    label: item.label,
    href: item.href,
    services: item.services,
  }
}

function metricDescriptor(metric: DashboardMetric): DashboardWidgetDescriptor {
  return {
    id: metric.id,
    kind: 'metric',
    label: metric.label,
    href: metric.href,
    icon: metric.icon,
    services: metric.services,
  }
}

function sectionDescriptor(section: DashboardSection): DashboardWidgetDescriptor {
  return {
    id: section.id,
    kind: 'section',
    title: section.title,
    icon: section.icon,
    services: section.services,
  }
}

export function filterDashboardMetrics(metrics: DashboardMetric[], services: TenantServiceFlags, access?: DashboardAccess): DashboardMetric[] {
  return metrics.filter((metric) => canRenderDashboardWidget(metricDescriptor(metric), services, access))
}

export function filterDashboardSection(section: DashboardSection, services: TenantServiceFlags, access?: DashboardAccess): DashboardSection | null {
  if (!canRenderDashboardWidget(sectionDescriptor(section), services, access)) return null

  const items = section.items.filter((item) => canRenderDashboardWidget(itemDescriptor(item), services, access))

  return { ...section, items }
}

export function filterDashboardSections(sections: DashboardSection[], services: TenantServiceFlags, access?: DashboardAccess): DashboardSection[] {
  return sections
    .map((section) => filterDashboardSection(section, services, access))
    // Com permissão aplicada, seção que ficou sem nenhum item some (sem "caixa vazia").
    .filter((section): section is DashboardSection => Boolean(section) && (!access || section!.items.length > 0))
}
