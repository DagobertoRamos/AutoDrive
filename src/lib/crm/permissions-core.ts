// =============================================================================
// CRM — Permissões por loja (Fase D). Núcleo PURO (client-safe, testado).
// Camadas (da mais forte p/ a mais fraca):
//   1. exceção do colaborador (UserModule) — tela de Colaboradores
//   2. regra da LOJA por perfil (esta camada, em Configurações do CRM)
//   3. padrão do sistema por perfil (MODULE_PERMISSIONS em permissions.ts)
// MASTER nunca é afetado. O ADM nunca perde "acessar"/"configurar" o CRM.
// =============================================================================

import { canAccessModule, type Module } from '@/lib/permissions'

export const CRM_ROLES = [
  { value: 'ADM', label: 'Administrador' },
  { value: 'GERENTE_GERAL', label: 'Gerente geral' },
  { value: 'GERENTE_ADMINISTRATIVO', label: 'Gerente adm.' },
  { value: 'GERENTE', label: 'Gerente' },
  { value: 'VENDEDOR_LIDER', label: 'Vendedor líder' },
  { value: 'VENDEDOR', label: 'Vendedor' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
  { value: 'USUARIO_LIDER', label: 'Usuário líder' },
  { value: 'USUARIO', label: 'Usuário' },
] as const

export const CRM_PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: 'crm', label: 'Acessar o CRM', group: 'Acesso' },
  { key: 'crm.view.own', label: 'Ver os próprios leads', group: 'Acesso' },
  { key: 'crm.view.unit', label: 'Ver leads da unidade', group: 'Acesso' },
  { key: 'crm.view.all', label: 'Ver todos os leads da loja', group: 'Acesso' },
  { key: 'crm.kanban.view.own', label: 'Kanban: ver os próprios', group: 'Kanban' },
  { key: 'crm.kanban.view.unit', label: 'Kanban: ver da unidade', group: 'Kanban' },
  { key: 'crm.kanban.move.own', label: 'Kanban: mover os próprios', group: 'Kanban' },
  { key: 'crm.kanban.move.unit', label: 'Kanban: mover da unidade', group: 'Kanban' },
  { key: 'crm.lead.create', label: 'Cadastrar lead', group: 'Leads' },
  { key: 'crm.lead.edit.own', label: 'Editar os próprios leads', group: 'Leads' },
  { key: 'crm.lead.edit.unit', label: 'Editar leads da unidade', group: 'Leads' },
  { key: 'crm.lead.transfer.own', label: 'Transferir os próprios leads', group: 'Leads' },
  { key: 'crm.lead.transfer', label: 'Transferir leads da unidade', group: 'Leads' },
  { key: 'crm.lead.convert', label: 'Converter (sucesso)', group: 'Leads' },
  { key: 'crm.lead.mark_lost', label: 'Marcar como perdido', group: 'Leads' },
  { key: 'crm.lead.recycle', label: 'Reciclar', group: 'Leads' },
  { key: 'crm.lead.archive', label: 'Arquivar', group: 'Leads' },
  { key: 'crm.lead.merge', label: 'Unificar duplicados', group: 'Leads' },
  { key: 'crm.lead.delete', label: 'Excluir lead', group: 'Leads' },
  { key: 'crm.interaction.create', label: 'Registrar interação', group: 'Atendimento' },
  { key: 'crm.visit.manage', label: 'Agendar/gerir visitas', group: 'Atendimento' },
  { key: 'crm.vehicle.manage', label: 'Veículos de interesse', group: 'Atendimento' },
  { key: 'crm.deal.link', label: 'Vincular negociação', group: 'Atendimento' },
  { key: 'crm.attendance.view.own', label: 'Atendimentos: ver os próprios', group: 'Atendimento' },
  { key: 'crm.attendance.view.unit', label: 'Atendimentos: ver da unidade', group: 'Atendimento' },
  { key: 'crm.attendance.create', label: 'Atendimentos: registrar', group: 'Atendimento' },
  { key: 'crm.attendance.finish', label: 'Atendimentos: finalizar', group: 'Atendimento' },
  { key: 'crm.sdr.view', label: 'Mesa SDR: visualizar', group: 'Gestão' },
  { key: 'crm.sdr.manage', label: 'Mesa SDR: gerenciar', group: 'Gestão' },
  { key: 'crm.reports.view', label: 'Relatórios do CRM', group: 'Gestão' },
  { key: 'crm.settings.manage', label: 'Configurar o CRM', group: 'Gestão' },
]

const KEYS = new Set(CRM_PERMISSIONS.map((p) => p.key))
const ROLES = new Set<string>(CRM_ROLES.map((r) => r.value))
/** Nunca podem ser negados ao ADM (evita a loja se trancar para fora). */
const ADM_LOCKED = new Set(['crm', 'crm.settings.manage'])

export type RolePermissionOverrides = Record<string, Record<string, boolean>> // module → role → allowed

export function isCrmPermission(key: string): boolean {
  return KEYS.has(key)
}

export function systemDefault(role: string, key: string): boolean {
  return canAccessModule(role, key as Module)
}

export function isLocked(role: string, key: string): boolean {
  return role === 'ADM' && ADM_LOCKED.has(key)
}

/** Mantém só overrides válidos e que DIFEREM do padrão (o resto é ruído). */
export function sanitizeRolePermissions(input: unknown): RolePermissionOverrides {
  if (!input || typeof input !== 'object') return {}
  const out: RolePermissionOverrides = {}
  for (const [key, roles] of Object.entries(input as Record<string, unknown>)) {
    if (!KEYS.has(key) || !roles || typeof roles !== 'object') continue
    for (const [role, allowed] of Object.entries(roles as Record<string, unknown>)) {
      if (!ROLES.has(role) || typeof allowed !== 'boolean') continue
      if (isLocked(role, key) || allowed === systemDefault(role, key)) continue
      ;(out[key] ??= {})[role] = allowed
    }
  }
  return out
}

/** Valor efetivo por perfil na loja (sem a exceção individual). */
export function effectiveRolePermission(role: string, key: string, overrides: RolePermissionOverrides): boolean {
  if (role === 'MASTER') return systemDefault(role, key)
  if (isLocked(role, key)) return true
  const o = overrides[key]?.[role]
  return typeof o === 'boolean' ? o : systemDefault(role, key)
}
