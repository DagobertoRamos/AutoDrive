// =============================================================================
// tenant-lifecycle/core.ts — regras PURAS do ciclo de vida da loja (tenant).
//
// "Desativar" uma loja (status BANIDO no banco — o enum não foi renomeado para
// não exigir migração) faz duas coisas:
//   1. corta o acesso de TODOS os usuários da loja (login e sessões abertas);
//   2. inicia o prazo de guarda de 5 anos. Durante o prazo os dados e documentos
//      ficam intactos e a loja pode ser reativada. Vencido o prazo, o sistema
//      apaga tudo automaticamente — antes disso o MASTER é avisado várias vezes
//      para fazer o backup.
//
// Sem Prisma/Next aqui: roda em teste unitário.
// =============================================================================

/** Status em que os usuários da loja NÃO podem entrar no sistema. */
export const BLOCKED_TENANT_STATUSES = ['BANIDO', 'CANCELADO', 'SUSPENSO', 'BLOQUEADO'] as const

/** Status que contam o prazo de guarda (e terminam em exclusão automática). */
export const RETENTION_TENANT_STATUSES = ['BANIDO'] as const

export const RETENTION_YEARS = 5

/** Avisos ao MASTER: quantos dias antes da exclusão. */
export const WARNING_DAYS = [180, 90, 60, 30, 15, 7, 3, 1] as const

/**
 * Carência mínima entre o PRIMEIRO aviso efetivamente enviado e a exclusão.
 * Se os avisos não saíram (cron parado, e-mail fora), a exclusão é adiada —
 * nunca se apaga uma loja sem o MASTER ter sido avisado com antecedência.
 */
export const MIN_NOTICE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export function isTenantBlocked(status: string | null | undefined): boolean {
  return !!status && (BLOCKED_TENANT_STATUSES as readonly string[]).includes(status)
}

export function countsRetention(status: string | null | undefined): boolean {
  return !!status && (RETENTION_TENANT_STATUSES as readonly string[]).includes(status)
}

/** Mensagem exibida no login para quem é de uma loja bloqueada. */
export function blockedTenantMessage(status: string | null | undefined): string {
  switch (status) {
    case 'BANIDO':
      return 'Esta loja está desativada. Entre em contato com o suporte AutoDrive para reativar o cadastro.'
    case 'CANCELADO':
      return 'O contrato desta loja foi cancelado. Entre em contato com o suporte AutoDrive.'
    case 'SUSPENSO':
      return 'O acesso desta loja está suspenso. Entre em contato com o suporte AutoDrive.'
    default:
      return 'O acesso desta loja está bloqueado. Entre em contato com o suporte AutoDrive.'
  }
}

/** Rótulos amigáveis (BANIDO aparece como "Desativado"). */
export const TENANT_STATUS_LABELS: Record<string, string> = {
  ATIVO: 'Ativo',
  SUSPENSO: 'Suspenso',
  BLOQUEADO: 'Bloqueado',
  BANIDO: 'Desativado',
  CANCELADO: 'Cancelado',
  TESTE: 'Teste',
  INADIMPLENTE: 'Inadimplente',
  PAUSADO: 'Pausado',
}

// ── Prazo de guarda ───────────────────────────────────────────────────────────

export interface RetentionRecord {
  tenantId: string
  tenantName: string
  deactivatedAt: string // ISO
  purgeAt: string // ISO (deactivatedAt + 5 anos)
  /** Limiares (dias) já avisados ao MASTER. */
  warned: number[]
  /** Quando saiu o primeiro aviso (base da carência mínima). */
  firstWarnedAt?: string | null
  lastError?: string | null
}

export function addYears(date: Date, years: number): Date {
  const d = new Date(date.getTime())
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d
}

export function newRetentionRecord(tenantId: string, tenantName: string, deactivatedAt: Date): RetentionRecord {
  return {
    tenantId,
    tenantName,
    deactivatedAt: deactivatedAt.toISOString(),
    purgeAt: addYears(deactivatedAt, RETENTION_YEARS).toISOString(),
    warned: [],
    firstWarnedAt: null,
    lastError: null,
  }
}

export function daysUntil(targetIso: string, now: Date): number {
  return Math.ceil((new Date(targetIso).getTime() - now.getTime()) / DAY_MS)
}

/**
 * Data em que a exclusão pode de fato acontecer: o prazo de 5 anos OU a
 * carência mínima após o primeiro aviso — o que vier DEPOIS.
 */
export function effectivePurgeAt(rec: RetentionRecord): Date {
  const base = new Date(rec.purgeAt)
  if (!rec.firstWarnedAt) return new Date(Math.max(base.getTime(), Date.now() + MIN_NOTICE_DAYS * DAY_MS))
  const minByNotice = new Date(new Date(rec.firstWarnedAt).getTime() + MIN_NOTICE_DAYS * DAY_MS)
  return base > minByNotice ? base : minByNotice
}

/**
 * Qual aviso mandar agora (o menor limiar já alcançado e ainda não avisado).
 * Se o cron ficou parado e vários limiares passaram, manda UM aviso só — o
 * mais urgente — e marca todos os maiores como avisados.
 */
export function pendingWarning(rec: RetentionRecord, now: Date): { threshold: number; markAsWarned: number[] } | null {
  const left = daysUntil(rec.purgeAt, now)
  const reached = WARNING_DAYS.filter((d) => left <= d && !rec.warned.includes(d))
  if (!reached.length) return null
  const threshold = Math.min(...reached)
  return { threshold, markAsWarned: reached }
}

/** Pode apagar agora? Só depois do prazo E da carência mínima de aviso. */
export function isPurgeDue(rec: RetentionRecord, now: Date): boolean {
  if (!rec.firstWarnedAt) return false
  return now.getTime() >= effectivePurgeAt(rec).getTime()
}

export const RETENTION_KEY_PREFIX = 'tenant_retention:'
export const PURGED_KEY_PREFIX = 'tenant_purged:'
