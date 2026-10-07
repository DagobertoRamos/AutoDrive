// =============================================================================
// Alçadas de aprovação de pagamentos — regras puras (testadas).
//   Configuração por loja: ligada/desligada, valor isento (até X não precisa de
//   aprovação) e faixas { até R$, papéis que aprovam } em ordem crescente; a
//   última faixa sem limite cobre o resto. ADM e MASTER aprovam qualquer faixa.
//   Quem pediu o pagamento não aprova o próprio pedido (exceto ADM/MASTER).
// =============================================================================

export interface ApprovalBand { upTo: number | null; roles: string[] }
export interface ApprovalConfig { enabled: boolean; exemptUpTo: number; bands: ApprovalBand[] }

export const APPROVER_ROLES = ['GERENTE', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO', 'ADM'] as const
export const ROLE_LABEL: Record<string, string> = {
  GERENTE: 'Gerente', GERENTE_GERAL: 'Gerente geral', GERENTE_ADMINISTRATIVO: 'Gerente administrativo', FINANCEIRO: 'Financeiro', ADM: 'Administrador', MASTER: 'Master',
}
const ALWAYS = ['ADM', 'MASTER']

export const DEFAULT_APPROVAL_CONFIG: ApprovalConfig = {
  enabled: false,
  exemptUpTo: 500,
  bands: [
    { upTo: 5000, roles: ['GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO'] },
    { upTo: null, roles: ['ADM'] },
  ],
}

export function normalizeConfig(raw: unknown): ApprovalConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ApprovalConfig>
  const bands = Array.isArray(o.bands) ? o.bands
    .map((b) => ({ upTo: b && b.upTo != null && Number.isFinite(Number(b.upTo)) && Number(b.upTo) > 0 ? Math.round(Number(b.upTo) * 100) / 100 : null, roles: Array.isArray(b?.roles) ? b.roles.filter((r) => (APPROVER_ROLES as readonly string[]).includes(r)) : [] }))
    .filter((b) => b.roles.length) : DEFAULT_APPROVAL_CONFIG.bands
  bands.sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity))
  return {
    enabled: !!o.enabled,
    exemptUpTo: Number.isFinite(Number(o.exemptUpTo)) && Number(o.exemptUpTo) >= 0 ? Math.round(Number(o.exemptUpTo) * 100) / 100 : DEFAULT_APPROVAL_CONFIG.exemptUpTo,
    bands: bands.length ? bands : DEFAULT_APPROVAL_CONFIG.bands,
  }
}

/** Papéis que aprovam este valor; null = não precisa de aprovação. */
export function rolesFor(cfg: ApprovalConfig, amount: number): string[] | null {
  if (!cfg.enabled || !(amount > cfg.exemptUpTo)) return null
  const band = cfg.bands.find((b) => b.upTo == null || amount <= b.upTo) ?? cfg.bands[cfg.bands.length - 1]
  return [...new Set([...(band?.roles ?? []), ...ALWAYS])]
}

export function canDecide(roles: string[], actor: { id: string; role: string }, requestedById: string | null): string | null {
  if (!roles.includes(actor.role) && !ALWAYS.includes(actor.role)) return 'Você não tem alçada para este valor.'
  if (requestedById && requestedById === actor.id && !ALWAYS.includes(actor.role)) return 'Quem pediu o pagamento não pode aprovar.'
  return null
}
