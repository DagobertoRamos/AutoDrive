// =============================================================================
// modules-catalog.ts — catálogo ÚNICO de módulos e ferramentas liberáveis.
// Usado pelo MASTER (liga/desliga por loja) e pelo ADM da loja (libera/bloqueia
// por colaborador). Cada chave é um `module` de permissão (a mesma usada no
// menu e nos gates de API), então ligar/desligar reflete no menu E no backend.
//
// HIERARQUIA (regra única, ver effectiveDisabled):
//   módulo (root) → partes → ferramentas. Uma ferramenta só vale se TODOS os
//   seus "pais" estiverem ligados. Desligar o pai desliga tudo abaixo; ligar
//   uma ferramenta liga os pais (applyModuleChanges). Assim nunca mais fica
//   "ferramenta liberada mas menu escondido" (caso da Donna: a raiz `marketing`
//   estava dentro da área SDR e foi desligada junto, sumindo com Publicações).
//
// NÃO inclui itens de plataforma (master.*), perfil, dashboard e configurações
// da loja (sempre disponíveis). Default: sem registro em TenantModule = ligado.
// =============================================================================

export interface ModuleFeature { key: string; label: string; level?: number; sensitive?: boolean }
export interface ModulePart { label: string; features: ModuleFeature[] }
export interface SystemModule {
  id: string
  label: string
  description: string
  /** Chave que libera o módulo inteiro (o grupo do menu). Primeira ferramenta da 1ª parte. */
  root: string
  parts: ModulePart[]
}
/** Visão "achatada" (compatível com as telas antigas): uma área por parte. */
export interface ModuleGroup extends ModulePart { area: string; moduleId: string; moduleLabel: string; root: string; features: ModuleFeature[] }

export const SYSTEM_MODULES: SystemModule[] = [
  { id: 'stock', label: 'Estoque', root: 'stock', description: 'Veículos, avaliações e entrada no estoque.', parts: [
    { label: 'Estoque', features: [
      { key: 'stock', label: 'Estoque (acesso ao menu)' },
      { key: 'stock.view', label: 'Ver estoque' },
      { key: 'stock.manage', label: 'Cadastrar, editar e excluir veículos' },
      { key: 'stock.pendencies.configure', label: 'Configurar pendências de estoque' },
    ] },
    { label: 'Avaliações', features: [
      { key: 'stock.evaluate', label: 'Fazer / ver avaliações' },
      { key: 'stock.evaluate.config', label: 'Configurar avaliação (reparos e regras)', level: 2 },
    ] },
  ] },
  { id: 'negotiations', label: 'Negociações', root: 'negotiations', description: 'Vendas, trocas, compras e consignação.', parts: [
    { label: 'Negociações', features: [
      { key: 'negotiations', label: 'Ver / criar negociações' },
      { key: 'negotiations.approve', label: 'Aprovar negociações', level: 2 },
      { key: 'negotiations.manage', label: 'Gerenciar todas as negociações', level: 2 },
      { key: 'negotiations.financing', label: 'Editar ILA/IOF do retorno', level: 3, sensitive: true },
    ] },
  ] },
  { id: 'ops', label: 'Operações veiculares', root: 'ops.panel', description: 'RENAVE, NF-e, transferências e consultas.', parts: [
    { label: 'Painel e RENAVE', features: [
      { key: 'ops.panel', label: 'Menu Operações (painel e listas da loja)' },
      { key: 'ops.renave.view', label: 'Ver RENAVE' },
      { key: 'ops.renave.operate', label: 'Operar RENAVE (entrada e saída)' },
    ] },
    { label: 'Notas fiscais', features: [
      { key: 'ops.fiscal.view', label: 'Ver notas fiscais' },
      { key: 'ops.fiscal.issue', label: 'Emitir / vincular NF-e' },
      { key: 'ops.fiscal.cancel', label: 'Cancelar NF-e', sensitive: true },
    ] },
    { label: 'Transferências e documentos', features: [
      { key: 'ops.transfer.view', label: 'Ver transferências' },
      { key: 'ops.transfer.start', label: 'Iniciar transferência' },
      { key: 'ops.documents.view', label: 'Ver documentos do veículo' },
      { key: 'ops.compliance.manage', label: 'Restrições, vistorias e consignação' },
      { key: 'ops.store_transfer', label: 'Transferir veículo entre lojas' },
      { key: 'ops.vehicle_data.query', label: 'Consultar débitos e restrições' },
    ] },
    { label: 'Custos e configuração', features: [
      { key: 'ops.costs.view', label: 'Ver custos do veículo', sensitive: true },
      { key: 'ops.margin.view', label: 'Ver margem da operação', sensitive: true },
      { key: 'ops.settings', label: 'Configurar operações e certificado', sensitive: true },
      { key: 'ops.logs.view', label: 'Ver detalhes técnicos', sensitive: true },
    ] },
  ] },
  { id: 'sellerQueue', label: 'Fila de Atendimento', root: 'sellerQueue.view', description: 'Vendedor da vez: fila, painel, chamadas e relatórios.', parts: [
    { label: 'Uso da fila', features: [
      { key: 'sellerQueue.view', label: 'Fila de Atendimento (acesso ao menu)' },
      { key: 'sellerQueue.checkIn', label: 'Entrar na fila (ser chamado p/ atender)' },
      { key: 'sellerQueue.customerArrived', label: 'Cliente na loja' },
      { key: 'sellerQueue.attend', label: 'Atender' },
      { key: 'queue.call_current_seller', label: 'Chamar vendedor da vez', level: 1 },
      { key: 'queue.check_turn', label: 'Consultar a vez' },
      { key: 'queue.view.own', label: 'Ver a própria posição' },
      { key: 'queue.start_own_attendance', label: 'Iniciar o próprio atendimento' },
      { key: 'queue.finish_own_attendance', label: 'Finalizar o próprio atendimento' },
      { key: 'queue.pause_self', label: 'Pausar a si mesmo' },
      { key: 'queue.resume_self', label: 'Retomar a si mesmo' },
    ] },
    { label: 'Painel e liderança', features: [
      { key: 'sellerQueue.lead', label: 'Painel do líder' },
      { key: 'queue.panel.view', label: 'Ver painel da unidade' },
      { key: 'queue.panel.sound_control', label: 'Controlar som do painel' },
      { key: 'queue.panel.test_sound', label: 'Testar som do painel' },
      { key: 'queue.dashboard.view', label: 'Ver painel de indicadores da fila' },
      { key: 'queue.calls.view', label: 'Ver chamadas' },
      { key: 'queue.view.unit', label: 'Ver a fila da unidade', level: 2 },
      { key: 'queue.view.all', label: 'Ver todas as filas', level: 3 },
      { key: 'queue.personal_queues.view_unit', label: 'Ver filas pessoais da unidade', level: 2 },
      { key: 'queue.view_logs', label: 'Ver logs da fila', level: 2 },
    ] },
    { label: 'Gestão da fila', features: [
      { key: 'sellerQueue.manage', label: 'Gerência da fila' },
      { key: 'sellerQueue.override', label: 'Exceção com justificativa', level: 3, sensitive: true },
      { key: 'queue.send_alert_all', label: 'Enviar alerta para todos da fila', level: 2, sensitive: true },
      { key: 'queue.transfer_attendance', label: 'Transferir atendimento', level: 2, sensitive: true },
      { key: 'queue.takeover_attendance', label: 'Assumir atendimento', level: 2, sensitive: true },
      { key: 'queue.mark_seller_attending', label: 'Marcar vendedor em atendimento', level: 2 },
      { key: 'queue.finish_other_attendance', label: 'Finalizar atendimento de outro vendedor', level: 3, sensitive: true },
      { key: 'queue.finish_seller_attendance', label: 'Finalizar atendimento do vendedor', level: 3, sensitive: true },
      { key: 'queue.pause_other', label: 'Pausar outro vendedor', level: 2, sensitive: true },
      { key: 'queue.resume_other', label: 'Retomar outro vendedor', level: 2, sensitive: true },
      { key: 'queue.add_participant', label: 'Colocar vendedor na fila', level: 2, sensitive: true },
      { key: 'queue.remove_participant', label: 'Tirar vendedor da fila', level: 3, sensitive: true },
      { key: 'queue.block_participant', label: 'Bloquear vendedor', level: 3, sensitive: true },
      { key: 'queue.unblock_participant', label: 'Desbloquear vendedor', level: 3, sensitive: true },
      { key: 'queue.reorder', label: 'Alterar ordem da fila', level: 3, sensitive: true },
      { key: 'queue.force_skip_turn', label: 'Pular a vez à força', level: 3, sensitive: true },
      { key: 'queue.vacations.manage', label: 'Férias e ausências da fila', level: 2 },
      { key: 'queue.sellers.manage', label: 'Participação dos vendedores na fila', level: 2 },
    ] },
    { label: 'Relatórios e configuração', features: [
      { key: 'sellerQueue.reports', label: 'Relatórios da fila' },
      { key: 'sellerQueue.settings', label: 'Configurar a fila' },
      { key: 'queue.manage_settings', label: 'Configurar regras da fila', level: 4, sensitive: true },
    ] },
  ] },
  { id: 'commissions', label: 'Comissões', root: 'commissions', description: 'Extrato, cálculo e regras de comissão.', parts: [
    { label: 'Comissões', features: [
      { key: 'commissions', label: 'Ver comissões' },
      { key: 'commissions.calculate', label: 'Calcular comissões' },
      { key: 'commissions.rules', label: 'Regras de comissão' },
      { key: 'commissions.recalc', label: 'Recalcular período', level: 3, sensitive: true },
      { key: 'commissions.approve', label: 'Aprovar comissões', level: 3 },
      { key: 'commissions.adjust', label: 'Ajustar comissões', level: 3, sensitive: true },
    ] },
  ] },
  { id: 'finance', label: 'Centro Financeiro', root: 'finance', description: 'Contas, caixa, DRE, conciliação e folha.', parts: [
    { label: 'Financeiro', features: [
      { key: 'finance', label: 'Ver o centro financeiro e relatórios', level: 4, sensitive: true },
      { key: 'finance.manage', label: 'Lançar, baixar e configurar', level: 4, sensitive: true },
      { key: 'finance.payroll', label: 'Folha: salários e comissões', level: 4, sensitive: true },
      { key: 'finance.settle', label: 'Baixar pagamentos e recebimentos', level: 4, sensitive: true },
      { key: 'finance.reverse', label: 'Estornar e cancelar lançamentos', level: 4, sensitive: true },
      { key: 'finance.reconcile', label: 'Conciliação bancária', level: 4, sensitive: true },
      { key: 'finance.balances', label: 'Ver saldos bancários', level: 4, sensitive: true },
      { key: 'finance.profit', label: 'Ver custo, margem e lucro', level: 4, sensitive: true },
      { key: 'finance.export', label: 'Exportar dados do financeiro', level: 4, sensitive: true },
      { key: 'finance.period', label: 'Fechar e reabrir período', level: 4, sensitive: true },
    ] },
  ] },
  { id: 'financing', label: 'F&I (Financiamento)', root: 'financing', description: 'Simulação, fichas, bancos e produtos.', parts: [
    { label: 'F&I', features: [
      { key: 'financing', label: 'F&I — financiamento' },
      { key: 'financing.manage', label: 'Criar/editar proponentes, bancos e fichas' },
      { key: 'financing.config', label: 'Configurar F&I da loja' },
    ] },
  ] },
  { id: 'goals', label: 'Metas', root: 'goals', description: 'Metas da equipe.', parts: [
    { label: 'Metas', features: [
      { key: 'goals', label: 'Metas (ver)' },
      { key: 'goals.manage', label: 'Gerenciar metas' },
    ] },
  ] },
  { id: 'ranking', label: 'Ranking', root: 'ranking', description: 'Ranking e desempenho.', parts: [
    { label: 'Ranking', features: [
      { key: 'ranking', label: 'Ranking' },
      { key: 'ranking.view.own', label: 'Ver o próprio desempenho' },
      { key: 'ranking.view.unit', label: 'Ver ranking da unidade' },
      { key: 'ranking.view.all', label: 'Ver ranking geral' },
      { key: 'ranking.configure', label: 'Configurar pesos do ranking' },
      { key: 'ranking.settings.view', label: 'Ver participantes do ranking' },
      { key: 'ranking.settings.manage.unit', label: 'Configurar participantes da unidade', level: 2 },
      { key: 'ranking.settings.manage.tenant', label: 'Configurar participantes da loja', level: 3 },
    ] },
  ] },
  { id: 'pendencies', label: 'Central de Pendências', root: 'pendencies', description: 'Pendências, SLA e penalidades.', parts: [
    { label: 'Pendências', features: [
      { key: 'pendencies', label: 'Pendências (acesso)' },
      { key: 'pendencies.central', label: 'Central de pendências' },
      { key: 'pendencies.manage', label: 'Gerência de pendências' },
      { key: 'pendencies.settings', label: 'Configurações gerais da Central' },
    ] },
  ] },
  { id: 'communication', label: 'Comunicações', root: 'communication', description: 'Central, disparos, templates e avisos.', parts: [
    { label: 'Comunicações', features: [
      { key: 'communication', label: 'Comunicação (acesso)' },
      { key: 'communication.dispatch', label: 'Disparo' },
      { key: 'communication.templates', label: 'Templates' },
    ] },
  ] },
  { id: 'site', label: 'Site da loja', root: 'site', description: 'Anúncios, promoções, banners e configurações do site.', parts: [
    { label: 'Site', features: [
      { key: 'site', label: 'Site (acesso ao menu)' },
      { key: 'site.manage', label: 'Configurar o site, anúncios e publicação' },
    ] },
  ] },
  { id: 'marketing', label: 'Marketing', root: 'marketing', description: 'Central de Publicações, Mesa SDR e Telefonia.', parts: [
    { label: 'Acesso', features: [
      { key: 'marketing', label: 'Marketing (acesso ao menu)' },
    ] },
    { label: 'Central de Publicações', features: [
      { key: 'marketing.publications', label: 'Ver publicações, calendário e canais' },
      { key: 'marketing.publications.prepare', label: 'Preparar publicação' },
      { key: 'marketing.publications.approve', label: 'Aprovar fotos e conteúdo' },
      { key: 'marketing.publications.publish', label: 'Publicar, agendar, pausar e retirar' },
      { key: 'marketing.publications.connections', label: 'Conectar contas e regras automáticas' },
    ] },
    { label: 'Mesa SDR', features: [
      { key: 'marketing.sdr', label: 'Mesa SDR' },
      { key: 'marketing.sdr.manage', label: 'Gerir Mesa SDR' },
      { key: 'marketing.leads.distribute', label: 'Distribuição de leads' },
      { key: 'marketing.leads.claim', label: 'Assumir lead disponível' },
    ] },
    { label: 'Telefonia', features: [
      { key: 'marketing.telephony', label: 'Telefonia' },
      { key: 'marketing.telephony.manage', label: 'Gerir telefonia' },
      { key: 'marketing.telephony.recordings', label: 'Gravações' },
      { key: 'marketing.telephony.recordings.audit', label: 'Auditar acesso às gravações', level: 3, sensitive: true },
    ] },
  ] },
  { id: 'crm', label: 'CRM', root: 'crm', description: 'Leads, atendimentos, kanban e SDR do CRM.', parts: [
    { label: 'Leads', features: [
      { key: 'crm',               label: 'CRM (acesso)' },
      { key: 'crm.view.own',      label: 'Ver os próprios leads' },
      { key: 'crm.view.unit',     label: 'Ver leads da unidade', level: 2, sensitive: true },
      { key: 'crm.view.all',      label: 'Ver todos os leads (multi-unidade)', level: 3, sensitive: true },
      { key: 'crm.lead.create',   label: 'Criar leads' },
      { key: 'crm.lead.edit.own', label: 'Editar os próprios leads' },
      { key: 'crm.lead.edit.unit',label: 'Editar leads da unidade', level: 2 },
      { key: 'crm.lead.transfer', label: 'Transferir leads para outro vendedor', level: 2, sensitive: true },
      { key: 'crm.lead.transfer.own',  label: 'Transferir o próprio lead para outro vendedor' },
      { key: 'crm.lead.convert',  label: 'Converter lead em negociação', level: 2 },
      { key: 'crm.lead.mark_lost',label: 'Marcar lead como perdido' },
      { key: 'crm.lead.archive',       label: 'Arquivar lead' },
      { key: 'crm.lead.recycle',       label: 'Reciclar lead' },
      { key: 'crm.lead.merge',         label: 'Unificar leads duplicados', level: 3, sensitive: true },
      { key: 'crm.lead.delete',        label: 'Excluir lead (soft delete com auditoria)', level: 3, sensitive: true },
      { key: 'crm.interaction.create', label: 'Registrar interação no lead' },
      { key: 'crm.visit.manage',       label: 'Gerenciar visitas do lead' },
      { key: 'crm.vehicle.manage',     label: 'Gerenciar veículos de interesse do lead' },
      { key: 'crm.deal.link',          label: 'Vincular negociação ao lead' },
    ] },
    { label: 'Atendimentos', features: [
      { key: 'crm.attendance.view.own',  label: 'Ver os próprios atendimentos' },
      { key: 'crm.attendance.view.unit', label: 'Ver atendimentos da unidade', level: 2 },
      { key: 'crm.attendance.create',    label: 'Registrar atendimento' },
      { key: 'crm.attendance.finish',    label: 'Finalizar atendimento' },
    ] },
    { label: 'Kanban, SDR e configuração', features: [
      { key: 'crm.kanban.view.own',  label: 'Kanban — ver os próprios' },
      { key: 'crm.kanban.view.unit', label: 'Kanban — ver a unidade', level: 2 },
      { key: 'crm.kanban.move.own',  label: 'Kanban — mover os próprios' },
      { key: 'crm.kanban.move.unit', label: 'Kanban — mover da unidade', level: 2 },
      { key: 'crm.sdr.view',         label: 'Ver fila SDR' },
      { key: 'crm.sdr.manage',       label: 'Gerir fila SDR', level: 2, sensitive: true },
      { key: 'crm.reports.view',     label: 'Relatórios do CRM', level: 2 },
      { key: 'crm.settings.manage',  label: 'Configurar CRM (etapas, etiquetas, pipelines)', level: 3, sensitive: true },
    ] },
  ] },
  { id: 'registrations', label: 'Cadastros', root: 'registrations', description: 'Clientes, veículos, unidades, equipe e serviços.', parts: [
    { label: 'Cadastros', features: [
      { key: 'registrations', label: 'Cadastros (acesso)' },
      { key: 'registrations.customers', label: 'Clientes' },
      { key: 'registrations.vehicles', label: 'Veículos e fornecedores' },
      { key: 'registrations.units', label: 'Unidades' },
      { key: 'registrations.sellers', label: 'Colaboradores' },
      { key: 'registrations.managers', label: 'Gerentes' },
      { key: 'registrations.positions', label: 'Cargos' },
      { key: 'registrations.services', label: 'Serviços' },
      { key: 'registrations.warranties', label: 'Garantias' },
    ] },
  ] },
  { id: 'documents', label: 'Documentos', root: 'documents', description: 'Contratos, procurações, termos e declarações.', parts: [
    { label: 'Documentos', features: [
      { key: 'documents', label: 'Documentos (acesso)' },
      { key: 'documents.pdf', label: 'Gerar contratos, procurações, termos e declarações' },
      { key: 'documents.import', label: 'Importar documentos' },
    ] },
  ] },
  { id: 'ai', label: 'Inteligência Artificial', root: 'ai', description: 'IA controlada (chat e análise de documentos).', parts: [
    { label: 'IA', features: [
      { key: 'ai', label: 'IA controlada (chat/documentos)' },
    ] },
  ] },
  { id: 'logs', label: 'Relatórios', root: 'logs', description: 'Relatórios gerenciais e auditoria.', parts: [
    { label: 'Relatórios', features: [
      { key: 'logs', label: 'Relatórios' },
    ] },
  ] },
]

export const MODULE_CATALOG: ModuleGroup[] = SYSTEM_MODULES.flatMap((m) =>
  m.parts.map((p) => ({
    ...p,
    area: m.parts.length > 1 ? `${m.label} — ${p.label}` : m.label,
    moduleId: m.id,
    moduleLabel: m.label,
    root: m.root,
  })),
)

export const ALL_FEATURE_KEYS: string[] = MODULE_CATALOG.flatMap((g) => g.features.map((f) => f.key))
export const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  MODULE_CATALOG.flatMap((g) => g.features.map((f) => [f.key, f.label])),
)

// ── Hierarquia ──────────────────────────────────────────────────────────────

const KEY_SET = new Set(ALL_FEATURE_KEYS)

/** Exceções ao "prefixo pontuado" (a variante .own não depende da versão geral). */
const PARENT_OVERRIDE: Record<string, string> = {
  'crm.lead.transfer.own': 'crm',
}

/** Pai direto: o prefixo pontuado mais próximo que existe no catálogo; senão a raiz do módulo. */
export const PARENT_OF: Record<string, string | undefined> = (() => {
  const out: Record<string, string | undefined> = {}
  for (const m of SYSTEM_MODULES) {
    for (const p of m.parts) {
      for (const f of p.features) {
        if (f.key === m.root) { out[f.key] = undefined; continue }
        if (PARENT_OVERRIDE[f.key]) { out[f.key] = PARENT_OVERRIDE[f.key]; continue }
        let parent: string | undefined
        const segs = f.key.split('.')
        for (let i = segs.length - 1; i > 0 && !parent; i--) {
          const cand = segs.slice(0, i).join('.')
          if (KEY_SET.has(cand) && cand !== f.key) parent = cand
        }
        out[f.key] = parent ?? m.root
      }
    }
  }
  return out
})()

/** Todos os pais (do mais próximo até a raiz). */
export function ancestorsOf(key: string): string[] {
  const out: string[] = []
  let cur = PARENT_OF[key]
  while (cur && !out.includes(cur)) { out.push(cur); cur = PARENT_OF[cur] }
  return out
}

const CHILDREN_OF: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {}
  for (const [k, parent] of Object.entries(PARENT_OF)) if (parent) (out[parent] ??= []).push(k)
  return out
})()

/** Todos os descendentes (filhos, netos...). */
export function descendantsOf(key: string): string[] {
  const out: string[] = []
  const stack = [...(CHILDREN_OF[key] ?? [])]
  while (stack.length) {
    const k = stack.pop()!
    if (out.includes(k)) continue
    out.push(k)
    stack.push(...(CHILDREN_OF[k] ?? []))
  }
  return out
}

/**
 * Lista EFETIVA de desligados: a própria chave desligada OU algum pai
 * desligado. Chaves fora do catálogo desligadas são mantidas como estão.
 */
export function effectiveDisabled(explicitDisabled: Iterable<string>): string[] {
  const off = new Set(explicitDisabled)
  const out = new Set(off)
  for (const k of ALL_FEATURE_KEYS) if (ancestorsOf(k).some((a) => off.has(a))) out.add(k)
  return [...out]
}

/**
 * Aplica mudanças com cascata: ligar uma ferramenta liga os pais; desligar
 * desliga os filhos. Retorna o novo conjunto de desligados (só catálogo).
 */
export function applyModuleChanges(currentDisabled: Iterable<string>, changes: Record<string, boolean>): Set<string> {
  const off = new Set([...currentDisabled].filter((k) => KEY_SET.has(k)))
  const entries = Object.entries(changes).filter(([k]) => KEY_SET.has(k))
  // Ligações primeiro (sobem até a raiz), desligamentos depois (descem).
  for (const [k, on] of entries) if (on) { off.delete(k); for (const a of ancestorsOf(k)) off.delete(a) }
  for (const [k, on] of entries) if (!on) { off.add(k); for (const d of descendantsOf(k)) off.add(d) }
  return off
}

/**
 * Estado completo vindo de uma tela (mapa chave → ligado): normaliza para que
 * nenhum filho fique ligado com o pai desligado — pai desligado com filho
 * ligado é corrigido LIGANDO o pai (a intenção foi usar a ferramenta).
 */
export function normalizeFullState(enabled: Iterable<string>): { enabled: string[]; disabled: string[] } {
  const on = new Set([...enabled].filter((k) => KEY_SET.has(k)))
  for (const k of [...on]) for (const a of ancestorsOf(k)) on.add(a)
  return { enabled: ALL_FEATURE_KEYS.filter((k) => on.has(k)), disabled: ALL_FEATURE_KEYS.filter((k) => !on.has(k)) }
}
