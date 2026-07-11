// =============================================================================
// modules-catalog.ts — catálogo de FUNCIONALIDADES liberáveis por tenant (MASTER).
// Cada chave é um `module` de permissão (mesma usada no nav e nos gates), para
// que ligar/desligar reflita tanto no menu quanto no backend (requireModule).
// NÃO inclui itens de plataforma (master.*), perfil, dashboard e settings da
// loja (sempre disponíveis). Default: sem registro em TenantModule = HABILITADO.
// =============================================================================

export interface ModuleFeature { key: string; label: string; level?: number; sensitive?: boolean }
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
    { key: 'pendencies.settings', label: 'Configurações gerais da Central' },
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
    { key: 'sellerQueue.view', label: 'Ver a fila (para chamar, marque também "Chamar vendedor da vez")' },
    { key: 'sellerQueue.checkIn', label: 'Entrar na fila (ser chamado p/ atender)' },
    { key: 'sellerQueue.customerArrived', label: 'Cliente na loja' },
    { key: 'sellerQueue.attend', label: 'Atender' },
    { key: 'sellerQueue.lead', label: 'Painel do líder' },
    { key: 'sellerQueue.manage', label: 'Gerência da fila' },
    { key: 'sellerQueue.reports', label: 'Relatórios da fila' },
    { key: 'sellerQueue.settings', label: 'Configurar a fila' },
    { key: 'queue.call_current_seller', label: 'Chamar vendedor da vez', level: 1 },
    { key: 'queue.view_logs', label: 'Ver logs da fila', level: 2 },
    { key: 'queue.send_alert_all', label: 'Enviar alerta para todos da fila', level: 2, sensitive: true },
    { key: 'queue.transfer_attendance', label: 'Transferir atendimento', level: 2, sensitive: true },
    { key: 'queue.takeover_attendance', label: 'Assumir atendimento', level: 2, sensitive: true },
    { key: 'queue.finish_other_attendance', label: 'Finalizar atendimento de outro vendedor', level: 3, sensitive: true },
    { key: 'queue.pause_other', label: 'Pausar outro vendedor', level: 2, sensitive: true },
    { key: 'queue.resume_other', label: 'Retomar outro vendedor', level: 2, sensitive: true },
    { key: 'queue.add_participant', label: 'Colocar vendedor na fila', level: 2, sensitive: true },
    { key: 'queue.remove_participant', label: 'Tirar vendedor da fila', level: 3, sensitive: true },
    { key: 'queue.block_participant', label: 'Bloquear vendedor', level: 3, sensitive: true },
    { key: 'queue.unblock_participant', label: 'Desbloquear vendedor', level: 3, sensitive: true },
    { key: 'queue.reorder', label: 'Alterar ordem da fila', level: 3, sensitive: true },
    { key: 'queue.manage_settings', label: 'Configurar regras da fila', level: 4, sensitive: true },
  ] },
  { area: 'CRM — Relacionamento e Leads', features: [
    { key: 'crm',               label: 'CRM (acesso)' },
    { key: 'crm.view.own',      label: 'Ver os próprios leads' },
    { key: 'crm.view.unit',     label: 'Ver leads da unidade', level: 2, sensitive: true },
    { key: 'crm.view.all',      label: 'Ver todos os leads (multi-unidade)', level: 3, sensitive: true },
    { key: 'crm.lead.create',   label: 'Criar leads' },
    { key: 'crm.lead.edit.own', label: 'Editar os próprios leads' },
    { key: 'crm.lead.edit.unit',label: 'Editar leads da unidade', level: 2 },
    { key: 'crm.lead.transfer', label: 'Transferir leads para outro vendedor', level: 2, sensitive: true },
    { key: 'crm.lead.convert',  label: 'Converter lead em negociação', level: 2 },
    { key: 'crm.lead.mark_lost',label: 'Marcar lead como perdido' },
    { key: 'crm.lead.delete',   label: 'Excluir lead (soft delete com auditoria)', level: 3, sensitive: true },
    { key: 'crm.kanban.view.own',  label: 'Kanban — ver os próprios' },
    { key: 'crm.kanban.view.unit', label: 'Kanban — ver a unidade', level: 2 },
    { key: 'crm.kanban.move.own',  label: 'Kanban — mover os próprios' },
    { key: 'crm.kanban.move.unit', label: 'Kanban — mover da unidade', level: 2 },
    { key: 'crm.settings.manage',  label: 'Configurar CRM (etapas, etiquetas, pipelines)', level: 3, sensitive: true },
    { key: 'crm.sdr.view',         label: 'Ver fila SDR' },
    { key: 'crm.sdr.manage',       label: 'Gerir fila SDR', level: 2, sensitive: true },
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
