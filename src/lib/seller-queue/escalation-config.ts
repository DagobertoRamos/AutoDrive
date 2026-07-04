// =============================================================================
// seller-queue/escalation-config.ts — ESCALONAMENTO configurável da CHAMADA.
//
// Fica no JSON `SellerQueueUnitConfig.config.escalation` (sem migration de config),
// no mesmo padrão dos blocos `attendanceReminder` / `queuePush`.
//
// Modelo (spec): o cliente chega → nível 1 (vendedor da vez) é chamado; se não
// aceitar no tempo, escala para o próximo nível ativo (líder → gerente → gerente
// geral → colaboradores/admin). Cada nível pode ter VÁRIOS colaboradores; se
// `notifyAll`, todos são chamados ao mesmo tempo e o PRIMEIRO que aceitar assume.
// =============================================================================

export type EscalationTargetType =
  | 'VENDEDOR_DA_VEZ'   // próximo(s) da rotação (usa maxAttempts p/ tentar N da fila)
  | 'VENDEDOR_LIDER'    // colaboradores cargo/role líder na unidade
  | 'GERENTE'           // gerente(s) da unidade
  | 'GERENTE_GERAL'     // role GERENTE_GERAL do tenant
  | 'ADMIN'             // ADM/MASTER do tenant
  | 'CARGO'             // qualquer cargo/perfil (role) informado
  | 'COLABORADORES'     // lista explícita de userIds

export interface EscalationLevel {
  id: string
  name: string
  targetType: EscalationTargetType
  role: string | null          // usado quando targetType = CARGO
  targetUserIds: string[]      // usado quando targetType = COLABORADORES
  timeoutSeconds: number       // tempo p/ responder neste nível
  maxAttempts: number          // tentativas antes de escalar (VENDEDOR_DA_VEZ: nº de vendedores da rotação)
  notifyAll: boolean           // notifica todos do nível de uma vez
  active: boolean
}

export type OnNoResponse = 'ESCALATE' | 'SKIP' | 'NOTIFY_MANAGER' | 'HOLD'
export type OnDecline = 'ESCALATE' | 'MOVE_TO_END' | 'PAUSE' | 'NOTIFY_MANAGER'

export interface EscalationConfig {
  active: boolean
  firstAcceptWins: boolean
  onNoResponse: OnNoResponse    // ao esgotar todos os níveis sem resposta
  onDecline: OnDecline          // quando o colaborador recusa
  levels: EscalationLevel[]
}

// Trava anti-spam de push por atendimento/usuário (reaproveita queuePush do Codex
// quando existir; aqui só um teto de segurança do escalonamento).
export const ESCALATION_LIMITS = {
  timeoutMin: 10,
  timeoutMax: 86_400,
  attemptsMin: 1,
  attemptsMax: 20,
  maxLevels: 8,
} as const

export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  active: false,
  firstAcceptWins: true,
  onNoResponse: 'NOTIFY_MANAGER',
  onDecline: 'ESCALATE',
  levels: [
    { id: 'lvl1', name: 'Vendedor da vez', targetType: 'VENDEDOR_DA_VEZ', role: null, targetUserIds: [], timeoutSeconds: 30, maxAttempts: 1, notifyAll: false, active: true },
    { id: 'lvl2', name: 'Vendedor líder', targetType: 'VENDEDOR_LIDER', role: null, targetUserIds: [], timeoutSeconds: 30, maxAttempts: 1, notifyAll: true, active: true },
    { id: 'lvl3', name: 'Gerente', targetType: 'GERENTE', role: null, targetUserIds: [], timeoutSeconds: 30, maxAttempts: 1, notifyAll: true, active: true },
    { id: 'lvl4', name: 'Gerente geral', targetType: 'GERENTE_GERAL', role: null, targetUserIds: [], timeoutSeconds: 60, maxAttempts: 1, notifyAll: true, active: true },
  ],
}

const TARGET_TYPES: EscalationTargetType[] = ['VENDEDOR_DA_VEZ', 'VENDEDOR_LIDER', 'GERENTE', 'GERENTE_GERAL', 'ADMIN', 'CARGO', 'COLABORADORES']

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

function coerceLevel(raw: unknown, i: number): EscalationLevel {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const tt = String(o.targetType ?? '').toUpperCase() as EscalationTargetType
  return {
    id: String(o.id ?? `lvl${i + 1}`).slice(0, 40) || `lvl${i + 1}`,
    name: String(o.name ?? `Nível ${i + 1}`).trim().slice(0, 80) || `Nível ${i + 1}`,
    targetType: TARGET_TYPES.includes(tt) ? tt : 'COLABORADORES',
    role: o.role ? String(o.role).toUpperCase().slice(0, 40) : null,
    targetUserIds: Array.isArray(o.targetUserIds) ? [...new Set(o.targetUserIds.map((x) => String(x)).filter(Boolean))].slice(0, 50) : [],
    timeoutSeconds: clampInt(o.timeoutSeconds, ESCALATION_LIMITS.timeoutMin, ESCALATION_LIMITS.timeoutMax, 30),
    maxAttempts: clampInt(o.maxAttempts, ESCALATION_LIMITS.attemptsMin, ESCALATION_LIMITS.attemptsMax, 1),
    notifyAll: o.notifyAll === true,
    active: o.active !== false,
  }
}

export function coerceEscalationConfig(raw: unknown): EscalationConfig {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const onNoResp = String(o.onNoResponse ?? '').toUpperCase()
  const onDec = String(o.onDecline ?? '').toUpperCase()
  const levels = Array.isArray(o.levels) ? o.levels.slice(0, ESCALATION_LIMITS.maxLevels).map(coerceLevel) : DEFAULT_ESCALATION_CONFIG.levels
  return {
    active: o.active === true,
    firstAcceptWins: o.firstAcceptWins !== false,
    onNoResponse: (['ESCALATE', 'SKIP', 'NOTIFY_MANAGER', 'HOLD'] as string[]).includes(onNoResp) ? onNoResp as OnNoResponse : 'NOTIFY_MANAGER',
    onDecline: (['ESCALATE', 'MOVE_TO_END', 'PAUSE', 'NOTIFY_MANAGER'] as string[]).includes(onDec) ? onDec as OnDecline : 'ESCALATE',
    levels,
  }
}

/** Lê o bloco de escalonamento de dentro do config JSON da unidade. */
export function readEscalationConfig(unitConfigJson: unknown): EscalationConfig {
  const root = (unitConfigJson && typeof unitConfigJson === 'object') ? unitConfigJson as Record<string, unknown> : {}
  if (root.escalation == null) return { ...DEFAULT_ESCALATION_CONFIG, levels: DEFAULT_ESCALATION_CONFIG.levels.map((l) => ({ ...l })) }
  return coerceEscalationConfig(root.escalation)
}

/** Índice do PRÓXIMO nível ATIVO a partir de `fromIndex` (exclusivo). -1 se não há. */
export function nextActiveLevelIndex(levels: EscalationLevel[], fromIndex: number): number {
  for (let i = fromIndex + 1; i < levels.length; i++) {
    if (levels[i]?.active) return i
  }
  return -1
}

/** Primeiro nível ativo (>= 0) ou -1. */
export function firstActiveLevelIndex(levels: EscalationLevel[]): number {
  return nextActiveLevelIndex(levels, -1)
}
