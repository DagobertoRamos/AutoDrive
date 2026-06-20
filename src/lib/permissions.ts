// =============================================================================
// AutoDrive — Sistema de Permissões em Pirâmide
// Controla acesso por role, módulo e ação
// =============================================================================

// ── Tipos ────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'MASTER'
  | 'ADM'
  | 'GERENTE_GERAL'
  | 'GERENTE_ADMINISTRATIVO'
  | 'GERENTE'
  | 'VENDEDOR_LIDER'
  | 'VENDEDOR'
  | 'FINANCEIRO'
  | 'USUARIO_LIDER'
  | 'USUARIO'

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'finalize'
  | 'reactivate'
  | 'export'
  | 'configure'
  | 'import'
  | 'calculate'
  | 'dispatch'
  | 'readPdf'

export type Module =
  | 'stock'                       // módulo estoque
  | 'stock.view'                  // ver estoque
  | 'stock.evaluate'              // fazer avaliações
  | 'stock.manage'                // criar/editar/excluir veículos no estoque
  | 'stock.pendencies.configure'  // configurar opções de pendências (MASTER/ADM)
  | 'dashboard'
  | 'pendencies'
  | 'pendencies.manage'         // gerenciar pendências da equipe
  | 'pendencies.central'        // visão central de todas
  | 'negotiations'              // módulo negociações
  | 'negotiations.approve'      // liberar negociações
  | 'negotiations.manage'       // gerenciar todas negociações
  | 'negotiations.financing'    // editar ILA/IOF do retorno (financeiro/admin)
  | 'commissions'
  | 'commissions.rules'
  | 'commissions.calculate'
  | 'commissions.approve'
  | 'commissions.adjust'
  | 'communication'
  | 'communication.dispatch'
  | 'communication.templates'
  | 'documents'
  | 'documents.pdf'
  | 'documents.import'
  | 'registrations'
  | 'registrations.sellers'
  | 'registrations.managers'
  | 'registrations.units'
  | 'registrations.customers'
  | 'registrations.vehicles'
  | 'registrations.services'
  | 'registrations.warranties'
  | 'registrations.positions'
  | 'settings'
  | 'settings.identity'
  | 'settings.sheets'
  | 'settings.email'
  | 'settings.whatsapp'
  | 'settings.commission'
  | 'settings.critical'         // apenas MASTER
  | 'finance'                     // módulo financeiro (ver lançamentos/relatórios)
  | 'finance.manage'              // criar/editar/excluir lançamentos, contas, categorias
  | 'financing'                   // módulo financiamento (FN): proponentes, fichas, simulações
  | 'financing.manage'            // criar/editar proponentes, bancos, fichas
  | 'financing.config'            // configurar F&I da loja (bancos, credenciais, prioridades, retornos) — ADM/gestão/financeiro
  | 'ai'                          // usar a IA controlada (chat de ajuda, ler/resumir documentos) — loja
  | 'marketing'                             // módulo Marketing (Mesa SDR/pré-vendas + telefonia) — base
  | 'marketing.sdr'                         // operar a Mesa SDR (inbox de leads, qualificar)
  | 'marketing.sdr.manage'                  // gerenciar a mesa: times, membros, políticas
  | 'marketing.leads.distribute'            // distribuir/atribuir leads (políticas/manual)
  | 'marketing.leads.claim'                 // assumir lead disponível (tanque de tubarão)
  | 'marketing.telephony'                   // ver telefonia (chamadas, números)
  | 'marketing.telephony.manage'            // gerenciar conexões/números de telefonia
  | 'marketing.telephony.recordings'        // ouvir gravações de chamadas
  | 'marketing.telephony.recordings.audit'  // auditar acesso a gravações de chamadas
  | 'logs'
  | 'profile'
  | 'master'                    // painel master da plataforma
  | 'master.tenants'
  | 'master.modules'
  | 'master.financing'          // painel F&I do MASTER (provedores, adapters, webhooks, logs técnicos)
  | 'master.ai'                 // painel de IA do MASTER (provedores, instruções, base de conhecimento, logs)
  | 'master.marketing.telephony' // painel global de telefonia do MASTER (provedores homologados, limites)
  | 'master.plans'
  | 'master.users'
  | 'master.communication'
  | 'master.feature-flags'
  | 'master.maintenance'
  | 'master.security'
  | 'master.identity'
  | 'master.billing'
  | 'master.integrations'
  | 'master.audit'
  | 'goals'                       // ver metas
  | 'goals.manage'                // criar/configurar metas e níveis
  | 'ranking'                     // ver ranking
  | 'ranking.configure'           // configurar pesos do ranking
  // ── Comercial › Fila de Atendimento ("Vendedor da Vez") ──────────────────
  | 'sellerQueue.view'            // ver a fila / própria posição / histórico
  | 'sellerQueue.checkIn'         // entrar/sair/pausar a fila (presença)
  | 'sellerQueue.customerArrived' // registrar "cliente na loja"
  | 'sellerQueue.attend'          // aceitar/recusar/finalizar atendimento
  | 'sellerQueue.lead'            // painel do líder (chamar/confirmar/pular)
  | 'sellerQueue.manage'          // gerente: auditar/reordenar/bloquear/corrigir
  | 'sellerQueue.reports'         // relatórios da fila/atendimentos
  | 'sellerQueue.settings'        // configurar regras da unidade
  | 'sellerQueue.override'        // exceção/override com justificativa

// ── Hierarquia numérica de roles ─────────────────────────────────────────────
// Quanto maior, mais alto na hierarquia

const ROLE_LEVEL: Record<UserRole, number> = {
  MASTER:                 700,
  ADM:                    600,
  GERENTE_GERAL:          500,
  GERENTE_ADMINISTRATIVO: 450,
  GERENTE:                400,
  VENDEDOR_LIDER:         350,
  VENDEDOR:               300,
  FINANCEIRO:             250,
  USUARIO_LIDER:          200,
  USUARIO:                100,
}

// ── Permissões de módulo por role ─────────────────────────────────────────────
// Define quais roles têm acesso a quais módulos e ações

type ModulePermission = {
  roles: UserRole[]
  actions: Action[]
}

const MODULE_PERMISSIONS: Record<Module, ModulePermission> = {
  stock: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR'],
    actions: ['read'],
  },
  'stock.view': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR'],
    actions: ['read'],
  },
  'stock.evaluate': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR'],
    actions: ['read', 'create', 'update'],
  },
  'stock.manage': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'stock.pendencies.configure': {
    roles: ['MASTER', 'ADM'],
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  dashboard: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read'],
  },
  pendencies: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read', 'create'],
  },
  'pendencies.manage': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'create', 'update', 'finalize', 'reactivate', 'delete'],
  },
  'pendencies.central': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL'],
    actions: ['read', 'create', 'update', 'finalize', 'reactivate', 'delete', 'export'],
  },
  commissions: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR', 'FINANCEIRO', 'USUARIO_LIDER'],
    actions: ['read'],
  },
  'commissions.rules': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'commissions.calculate': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'calculate'],
  },
  'commissions.approve': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL'],
    actions: ['approve'],
  },
  'commissions.adjust': {
    roles: ['MASTER', 'ADM'],
    actions: ['update'],
  },
  communication: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE', 'USUARIO_LIDER'],
    actions: ['read'],
  },
  'communication.dispatch': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE', 'USUARIO_LIDER'],
    actions: ['read', 'dispatch'],
  },
  'communication.templates': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  documents: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read'],
  },
  'documents.pdf': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'readPdf', 'create', 'update'],
  },
  'documents.import': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL'],
    actions: ['read', 'import', 'configure'],
  },
  registrations: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read'],
  },
  'registrations.sellers': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'create', 'update'],
  },
  'registrations.managers': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'registrations.units': {
    roles: ['MASTER', 'ADM'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'registrations.customers': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'create', 'update'],
  },
  'registrations.vehicles': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'create', 'update'],
  },
  'registrations.services': {
    roles: ['MASTER', 'ADM'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'registrations.warranties': {
    // Cadastro de garantias — admin/financeiro (vendedor NÃO cadastra).
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'registrations.positions': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  settings: {
    roles: ['MASTER', 'ADM'],
    actions: ['read'],
  },
  'settings.identity': {
    roles: ['MASTER', 'ADM'],
    actions: ['read', 'update'],
  },
  'settings.sheets': {
    roles: ['MASTER', 'ADM'],
    actions: ['read', 'create', 'update', 'delete', 'configure', 'import'],
  },
  'settings.email': {
    roles: ['MASTER', 'ADM'],
    actions: ['read', 'create', 'update', 'configure'],
  },
  'settings.whatsapp': {
    roles: ['MASTER', 'ADM'],
    actions: ['read', 'create', 'update', 'configure'],
  },
  'settings.commission': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL'],
    actions: ['read', 'create', 'update'],
  },
  'settings.critical': {
    roles: ['MASTER'],
    actions: ['read', 'configure', 'delete'],
  },
  logs: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'],
    actions: ['read', 'export'],
  },
  // Módulo Financeiro — administrativo/financeiro (ADM só vê o próprio tenant via tenantWhere).
  finance: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO'],
    actions: ['read', 'export'],
  },
  'finance.manage': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  // Módulo Financiamento (FN) — vendas + administração tratam de fichas/proponentes.
  financing: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO'],
    actions: ['read', 'export'],
  },
  'financing.manage': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  // Configuração do F&I da loja — gestão/financeiro (vendedor NÃO configura).
  'financing.config': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  // IA controlada — uso pela loja (chat de ajuda, ler/resumir documentos).
  ai: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read'],
  },
  // ── Marketing / Mesa SDR (pré-vendas) + Telefonia ──────────────────────────
  // Fase inicial: somente estrutura/placeholders. Distribuição inteligente,
  // tanque de tubarão, roleta e integração de telefonia ficam para fases futuras.
  marketing: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read'],
  },
  'marketing.sdr': {
    // Operar a mesa: ver inbox, qualificar, trabalhar leads atribuídos.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read', 'update'],
  },
  'marketing.sdr.manage': {
    // Configurar times, membros e políticas da mesa — gestão da loja.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE'],
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  'marketing.leads.distribute': {
    // Distribuir/atribuir leads (políticas automáticas ou manual) — gestão/SDR líder.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'USUARIO_LIDER'],
    actions: ['read', 'create', 'update'],
  },
  'marketing.leads.claim': {
    // Assumir um lead disponível (tanque de tubarão) — qualquer agente elegível.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read', 'update'],
  },
  'marketing.telephony': {
    // Ver telefonia (chamadas, números) — gestão/operação.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR'],
    actions: ['read'],
  },
  'marketing.telephony.manage': {
    // Gerenciar conexões/números (credenciais cifradas) — gestão da loja.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO'],
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  'marketing.telephony.recordings': {
    // Ouvir gravações de chamadas — acesso controlado (LGPD).
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE'],
    actions: ['read'],
  },
  'marketing.telephony.recordings.audit': {
    // Auditar quem acessou gravações — compliance/gestão sênior.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL'],
    actions: ['read'],
  },
  profile: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read', 'update'],
  },
  // Módulo negociações
  negotiations: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO'],
    actions: ['read', 'create'],
  },
  'negotiations.approve': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE', 'VENDEDOR_LIDER'],
    actions: ['approve', 'read'],
  },
  'negotiations.manage': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE'],
    actions: ['read', 'create', 'update', 'delete', 'approve'],
  },
  'negotiations.financing': {
    // Edição de ILA/IOF do retorno — financeiro/administrativo.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'FINANCEIRO'],
    actions: ['read', 'update', 'configure'],
  },
  // Painel Master da plataforma
  master: {
    roles: ['MASTER'],
    actions: ['read'],
  },
  'master.tenants': {
    roles: ['MASTER'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'master.modules': {
    roles: ['MASTER'],
    actions: ['read', 'configure'],
  },
  'master.financing': {
    roles: ['MASTER'],
    actions: ['read', 'configure'],
  },
  'master.ai': {
    roles: ['MASTER'],
    actions: ['read', 'configure'],
  },
  // Telefonia global do MASTER — provedores homologados e limites da plataforma.
  'master.marketing.telephony': {
    roles: ['MASTER'],
    actions: ['read', 'configure'],
  },
  'master.plans': {
    roles: ['MASTER'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'master.users': {
    roles: ['MASTER'],
    actions: ['read', 'create', 'update', 'delete'],
  },
  'master.communication': {
    roles: ['MASTER'],
    actions: ['read', 'create', 'update', 'delete', 'configure', 'dispatch'],
  },
  'master.feature-flags': {
    roles: ['MASTER'],
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  'master.maintenance': {
    roles: ['MASTER'],
    actions: ['read', 'create', 'update', 'configure'],
  },
  'master.security': {
    roles: ['MASTER'],
    actions: ['read', 'update', 'configure'],
  },
  'master.identity': {
    roles: ['MASTER'],
    actions: ['read', 'update'],
  },
  'master.billing': {
    roles: ['MASTER'],
    actions: ['read', 'create', 'update', 'configure'],
  },
  'master.integrations': {
    roles: ['MASTER'],
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  'master.audit': {
    roles: ['MASTER'],
    actions: ['read', 'export'],
  },
  goals: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read'],
  },
  'goals.manage': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE'],
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  ranking: {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR'],
    actions: ['read'],
  },
  'ranking.configure': {
    roles: ['MASTER', 'ADM', 'GERENTE_ADMINISTRATIVO'],
    actions: ['read', 'configure'],
  },
  // ── Comercial › Fila de Atendimento ("Vendedor da Vez") ──────────────────────
  // Operação na loja: vendedor entra na fila, registra cliente, atende.
  'sellerQueue.view': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'USUARIO_LIDER', 'USUARIO'],
    actions: ['read'],
  },
  'sellerQueue.checkIn': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR'],
    actions: ['read', 'create', 'update'],
  },
  'sellerQueue.customerArrived': {
    // Qualquer vendedor presente registra "cliente na loja" (não escolhe quem atende).
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR'],
    actions: ['read', 'create'],
  },
  'sellerQueue.attend': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR'],
    actions: ['read', 'update'],
  },
  'sellerQueue.lead': {
    // Painel do líder: chamar/confirmar/pular com justificativa.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER'],
    actions: ['read', 'update'],
  },
  'sellerQueue.manage': {
    // Gerente: auditar/reordenar/bloquear/corrigir.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE'],
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  'sellerQueue.reports': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER'],
    actions: ['read'],
  },
  'sellerQueue.settings': {
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE'],
    actions: ['read', 'create', 'update', 'delete', 'configure'],
  },
  'sellerQueue.override': {
    // Exceção/override autorizada (líder simples; gestão ampla) — sempre com justificativa.
    roles: ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER'],
    actions: ['read', 'update', 'configure'],
  },
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Verifica se um role tem acesso a um módulo
 */
export function canAccessModule(role: string | undefined, module: Module): boolean {
  if (!role) return false
  const perm = MODULE_PERMISSIONS[module]
  if (!perm) return false
  return perm.roles.includes(role as UserRole)
}

/**
 * Verifica se um role pode executar uma ação em um módulo
 */
export function canPerformAction(
  role: string | undefined,
  module: Module,
  action: Action,
): boolean {
  if (!role) return false
  const perm = MODULE_PERMISSIONS[module]
  if (!perm) return false
  return perm.roles.includes(role as UserRole) && perm.actions.includes(action)
}

/**
 * Verifica se um role tem nível >= ao mínimo exigido
 */
export function hasMinRole(role: string | undefined, minRole: UserRole): boolean {
  if (!role) return false
  const userLevel = ROLE_LEVEL[role as UserRole] ?? 0
  const minLevel  = ROLE_LEVEL[minRole] ?? 0
  return userLevel >= minLevel
}

/**
 * Compara dois roles: retorna true se roleA >= roleB na hierarquia
 */
export function isAtLeast(roleA: string | undefined, roleB: UserRole): boolean {
  return hasMinRole(roleA, roleB)
}

/**
 * Retorna o nível numérico do role (útil para comparações)
 */
export function getRoleLevel(role: string | undefined): number {
  if (!role) return 0
  return ROLE_LEVEL[role as UserRole] ?? 0
}

/**
 * Label de exibição do role
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  MASTER:                 'Master',
  ADM:                    'Administrador',
  GERENTE_GERAL:          'Gerente Geral',
  GERENTE_ADMINISTRATIVO: 'Gerente Administrativo',
  GERENTE:                'Gerente',
  VENDEDOR_LIDER:         'Vendedor Líder',
  VENDEDOR:               'Vendedor',
  FINANCEIRO:             'Financeiro',
  USUARIO_LIDER:          'Usuário Líder',
  USUARIO:                'Usuário',
}

/**
 * Badge color por role (classes Tailwind)
 */
export const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  MASTER:                 'bg-purple-100 text-purple-800',
  ADM:                    'bg-blue-100 text-blue-800',
  GERENTE_GERAL:          'bg-brand-100 text-brand-800',
  GERENTE_ADMINISTRATIVO: 'bg-teal-100 text-teal-800',
  GERENTE:                'bg-emerald-100 text-emerald-700',
  VENDEDOR_LIDER:         'bg-indigo-100 text-indigo-700',
  VENDEDOR:               'bg-gray-100 text-gray-700',
  FINANCEIRO:             'bg-cyan-100 text-cyan-700',
  USUARIO_LIDER:          'bg-amber-100 text-amber-700',
  USUARIO:                'bg-slate-100 text-slate-600',
}

/**
 * Lista de roles que o usuário pode gerenciar (não pode criar role acima de si)
 */
export function getManageableRoles(myRole: UserRole): UserRole[] {
  const myLevel = ROLE_LEVEL[myRole] ?? 0
  return (Object.entries(ROLE_LEVEL) as [UserRole, number][])
    .filter(([, level]) => level < myLevel)
    .map(([role]) => role)
}

/**
 * Guard para uso nas API routes — lança erro 403 se sem permissão
 */
export function requireModule(role: string | undefined, module: Module): void {
  if (!canAccessModule(role, module)) {
    throw new PermissionError(`Acesso negado ao módulo: ${module}`)
  }
}

export function requireAction(
  role: string | undefined,
  module: Module,
  action: Action,
): void {
  if (!canPerformAction(role, module, action)) {
    throw new PermissionError(
      `Sem permissão para '${action}' no módulo '${module}'`,
    )
  }
}

export class PermissionError extends Error {
  statusCode = 403
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}
