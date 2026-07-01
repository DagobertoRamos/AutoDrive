import type { Module } from '@/lib/permissions'

export type TenantServiceKey =
  | 'estoque'
  | 'negociacoes'
  | 'financeiro'
  | 'fi'
  | 'marketing'
  | 'sdr'
  | 'compras'
  | 'pendencias'
  | 'documentacao'
  | 'garantias'
  | 'produtosServicos'
  | 'comissoes'
  | 'ranking'
  | 'metas'
  | 'vendedorDaVez'
  | 'integracoes'
  | 'relatorios'
  | 'ia'
  | 'telefonia'
  | 'whatsappChat'
  | 'portais'
  | 'posVenda'
  | 'avisos'

export type TenantServiceFlags = Record<TenantServiceKey, boolean>

export interface TenantServiceDefinition {
  key: TenantServiceKey
  label: string
  modules: Module[]
}

export const TENANT_SERVICE_DEFINITIONS: TenantServiceDefinition[] = [
  { key: 'estoque', label: 'Estoque', modules: ['stock.view', 'stock.evaluate', 'stock.manage'] },
  { key: 'negociacoes', label: 'Negociações', modules: ['negotiations', 'negotiations.approve', 'negotiations.manage', 'negotiations.financing'] },
  { key: 'financeiro', label: 'Financeiro', modules: ['finance', 'finance.manage'] },
  { key: 'fi', label: 'F&I', modules: ['financing', 'financing.manage', 'financing.config'] },
  { key: 'marketing', label: 'Marketing', modules: ['marketing', 'marketing.leads.distribute', 'marketing.leads.claim'] },
  { key: 'sdr', label: 'SDR', modules: ['marketing.sdr', 'marketing.sdr.manage'] },
  { key: 'compras', label: 'Compras', modules: ['stock.evaluate', 'stock.manage'] },
  { key: 'pendencias', label: 'Pendências', modules: ['pendencies', 'pendencies.central', 'pendencies.manage'] },
  { key: 'documentacao', label: 'Documentação', modules: ['documents', 'documents.pdf', 'documents.import'] },
  { key: 'garantias', label: 'Garantias', modules: ['registrations.warranties', 'commissions.rules'] },
  { key: 'produtosServicos', label: 'Produtos e serviços', modules: ['registrations.services', 'financing', 'financing.config'] },
  { key: 'comissoes', label: 'Comissões', modules: ['commissions', 'commissions.calculate', 'commissions.rules'] },
  { key: 'ranking', label: 'Ranking', modules: ['ranking', 'ranking.configure'] },
  { key: 'metas', label: 'Metas', modules: ['goals', 'goals.manage'] },
  { key: 'vendedorDaVez', label: 'Vendedor da vez', modules: ['sellerQueue.view', 'sellerQueue.checkIn', 'sellerQueue.customerArrived', 'sellerQueue.attend', 'sellerQueue.lead', 'sellerQueue.manage', 'sellerQueue.reports', 'sellerQueue.settings'] },
  { key: 'integracoes', label: 'Integrações', modules: ['settings.whatsapp', 'settings.email', 'settings.sheets', 'master.integrations'] },
  { key: 'relatorios', label: 'Relatórios', modules: ['logs', 'sellerQueue.reports'] },
  { key: 'ia', label: 'IA', modules: ['ai'] },
  { key: 'telefonia', label: 'Telefonia', modules: ['marketing.telephony', 'marketing.telephony.manage', 'marketing.telephony.recordings'] },
  { key: 'whatsappChat', label: 'WhatsApp e chat', modules: ['communication', 'communication.dispatch', 'communication.templates', 'settings.whatsapp'] },
  { key: 'portais', label: 'Portais', modules: ['marketing', 'communication'] },
  { key: 'posVenda', label: 'Pós-venda', modules: ['pendencies', 'communication', 'sellerQueue.view'] },
  { key: 'avisos', label: 'Avisos', modules: ['communication', 'communication.dispatch', 'communication.templates'] },
]

export const TENANT_SERVICE_KEYS: TenantServiceKey[] = TENANT_SERVICE_DEFINITIONS.map((service) => service.key)

export function createTenantServiceFlags(enabled = false): TenantServiceFlags {
  return Object.fromEntries(
    TENANT_SERVICE_KEYS.map((key) => [key, enabled]),
  ) as TenantServiceFlags
}

export function hasTenantService(
  services: TenantServiceFlags,
  service: TenantServiceKey | TenantServiceKey[],
): boolean {
  const keys = Array.isArray(service) ? service : [service]
  return keys.some((key) => services[key])
}
