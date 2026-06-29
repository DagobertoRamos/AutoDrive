// =============================================================================
// modules-catalog.ts — catálogo de FUNCIONALIDADES liberáveis por tenant (MASTER).
// Cada chave é um `module` de permissão (mesma usada no nav e nos gates), para
// que ligar/desligar reflita tanto no menu quanto no backend (requireModule).
// NÃO inclui itens de plataforma (master.*), perfil, dashboard e settings da
// loja (sempre disponíveis). Default: sem registro em TenantModule = HABILITADO.
// =============================================================================

export interface ModuleFeature { key: string; label: string }
export interface ModuleGroup { area: string; features: ModuleFeature[] }

export const MODULE_CATALOG: ModuleGroup[] = [
  { area: 'Estoque', features: [
    { key: 'stock.view', label: 'Ver estoque' },
    { key: 'stock.evaluate', label: 'Fazer / ver avaliações' },
    { key: 'stock.pendencies.configure', label: 'Configurar pendências de estoque' },
  ] },
  { area: 'Negociações', features: [
    { key: 'negotiations', label: 'Ver / criar negociações' },
    { key: 'negotiations.approve', label: 'Aprovar negociações' },
  ] },
  { area: 'Comissões', features: [
    { key: 'commissions', label: 'Ver comissões' },
    { key: 'commissions.calculate', label: 'Calcular comissões' },
    { key: 'commissions.rules', label: 'Regras de comissão' },
  ] },
  { area: 'Financeiro', features: [
    { key: 'finance', label: 'Financeiro' },
  ] },
  { area: 'F&I (Financiamento)', features: [
    { key: 'financing', label: 'F&I — financiamento' },
    { key: 'financing.config', label: 'Configurar F&I da loja' },
  ] },
  { area: 'Metas e Ranking', features: [
    { key: 'goals', label: 'Metas (ver)' },
    { key: 'goals.manage', label: 'Gerenciar metas' },
    { key: 'ranking', label: 'Ranking' },
    { key: 'ranking.configure', label: 'Configurar ranking' },
  ] },
  { area: 'Pendências', features: [
    { key: 'pendencies', label: 'Pendências' },
    { key: 'pendencies.central', label: 'Central de pendências' },
    { key: 'pendencies.manage', label: 'Gerência de pendências' },
  ] },
  { area: 'Comunicações', features: [
    { key: 'communication', label: 'Comunicação' },
    { key: 'communication.dispatch', label: 'Disparo' },
    { key: 'communication.templates', label: 'Templates' },
  ] },
  { area: 'Marketing — SDR / Telefonia', features: [
    { key: 'marketing', label: 'Marketing (acesso)' },
    { key: 'marketing.sdr', label: 'Mesa SDR' },
    { key: 'marketing.sdr.manage', label: 'Gerir Mesa SDR' },
    { key: 'marketing.leads.distribute', label: 'Distribuição de leads' },
    { key: 'marketing.telephony', label: 'Telefonia' },
    { key: 'marketing.telephony.manage', label: 'Gerir telefonia' },
    { key: 'marketing.telephony.recordings', label: 'Gravações' },
  ] },
  { area: 'Comercial — Fila de Atendimento', features: [
    { key: 'sellerQueue.view', label: 'Ver fila / chamar vendedor da vez' },
    { key: 'sellerQueue.checkIn', label: 'Entrar na fila (ser chamado p/ atender)' },
    { key: 'sellerQueue.customerArrived', label: 'Cliente na loja' },
    { key: 'sellerQueue.attend', label: 'Atender' },
    { key: 'sellerQueue.lead', label: 'Painel do líder' },
    { key: 'sellerQueue.manage', label: 'Gerência da fila' },
    { key: 'sellerQueue.reports', label: 'Relatórios da fila' },
    { key: 'sellerQueue.settings', label: 'Configurar a fila' },
  ] },
  { area: 'Inteligência Artificial', features: [
    { key: 'ai', label: 'IA controlada (chat/documentos)' },
  ] },
  { area: 'Cadastros', features: [
    { key: 'registrations', label: 'Cadastros (acesso)' },
    { key: 'registrations.customers', label: 'Clientes' },
    { key: 'registrations.vehicles', label: 'Veículos' },
    { key: 'registrations.units', label: 'Unidades' },
    { key: 'registrations.sellers', label: 'Vendedores' },
    { key: 'registrations.managers', label: 'Gerentes' },
    { key: 'registrations.positions', label: 'Cargos' },
    { key: 'registrations.services', label: 'Serviços' },
    { key: 'registrations.warranties', label: 'Garantias' },
  ] },
  { area: 'Documentos e Relatórios', features: [
    { key: 'documents', label: 'Documentos' },
    { key: 'logs', label: 'Relatórios' },
  ] },
]

export const ALL_FEATURE_KEYS: string[] = MODULE_CATALOG.flatMap((g) => g.features.map((f) => f.key))
export const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  MODULE_CATALOG.flatMap((g) => g.features.map((f) => [f.key, f.label])),
)
