import { prisma } from '@/lib/prisma'

export const PENDENCY_SETTINGS_KEY_BASE = 'pendency_settings'
export const PENDENCY_SETTINGS_GROUP = 'pendency'

const PRIORITIES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
const AUTO_ARCHIVE_UNITS = ['minutes', 'hours', 'days'] as const
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export type PendencyPriorityKey = (typeof PRIORITIES)[number]
export type PendencyAutoArchiveUnit = (typeof AUTO_ARCHIVE_UNITS)[number]

export interface PendencyAutoSendSettings {
  enabled: boolean
  allowedDays: string[]
  startTime: string
  endTime: string
  frequency: string
  maxSends: number
  sendsPerDay: number
}

export interface PendencyAutoArchiveSettings {
  enabled: boolean
  afterValue: number
  afterUnit: PendencyAutoArchiveUnit
  onlyAfterManagerApproval: boolean
  onlyIfNotReopened: boolean
}

// Motor de SLA / pop-ups (Fase 3). Governa o pop-up bloqueante de compromisso
// de prazo (Alta/Urgente) e a cobrança automática quando o prazo estoura.
export interface PendencySlaEngineSettings {
  enabled: boolean                       // liga o motor de pop-ups
  requireCommitFor: PendencyPriorityKey[] // prioridades que exigem prazo comprometido
  maxDefer: number                       // nº máx. de adiamentos do pop-up de compromisso
  chargeIntervalHours: number            // intervalo mín. entre cobranças (prazo estourado)
  staleHours: number                     // Urgente sem atividade há X h → pop-up reaparece
  // Nagging / Crítica (Fase 4)
  overdueStrikesForCritical: number      // nº de prazos comprometidos estourados → Crítica
  criticalStaleHours: number             // Urgente sem resposta há X h → Crítica
  naggingL2Hours: number                 // em Crítica há N h → nível 2 (modal + push)
  naggingL3Hours: number                 // em Crítica há N h → nível 3 (escala + penalidade)
  naggingPushIntervalMinutes: number     // intervalo do push no nível 2
}

export interface PendencySettings {
  slaByPriority: Record<PendencyPriorityKey, number>
  slaEngine: PendencySlaEngineSettings
  autoSend: PendencyAutoSendSettings
  autoArchive: PendencyAutoArchiveSettings
}

export const DEFAULT_PENDENCY_SETTINGS: PendencySettings = {
  slaByPriority: { BAIXA: 4320, MEDIA: 2880, ALTA: 1440, URGENTE: 480 },
  slaEngine: {
    enabled: true,
    requireCommitFor: ['ALTA', 'URGENTE'],
    maxDefer: 3,
    chargeIntervalHours: 4,
    staleHours: 6,
    overdueStrikesForCritical: 2,
    criticalStaleHours: 12,
    naggingL2Hours: 2,
    naggingL3Hours: 6,
    naggingPushIntervalMinutes: 45,
  },
  autoSend: {
    enabled: false,
    allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    startTime: '08:00',
    endTime: '18:00',
    frequency: 'DAILY',
    maxSends: 5,
    sendsPerDay: 1,
  },
  autoArchive: {
    enabled: false,
    afterValue: 7,
    afterUnit: 'days',
    onlyAfterManagerApproval: true,
    onlyIfNotReopened: true,
  },
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function clampInt(value: unknown, fallback: number, max: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), max) : fallback
}

function sanitizeSla(raw: unknown, fallback = DEFAULT_PENDENCY_SETTINGS.slaByPriority): Record<PendencyPriorityKey, number> {
  const slaRaw = asRecord(raw)
  const sla = {} as Record<PendencyPriorityKey, number>
  for (const priority of PRIORITIES) {
    sla[priority] = clampInt(slaRaw[priority], fallback[priority], 60 * 24 * 30)
  }
  return sla
}

function sanitizeAutoSend(raw: unknown, fallback = DEFAULT_PENDENCY_SETTINGS.autoSend): PendencyAutoSendSettings {
  const autoRaw = asRecord(raw)
  const days = Array.isArray(autoRaw.allowedDays)
    ? autoRaw.allowedDays.map(String).filter((day) => (WEEKDAYS as readonly string[]).includes(day))
    : fallback.allowedDays
  const frequency = ['DAILY', 'HOURLY', 'WEEKLY'].includes(String(autoRaw.frequency))
    ? String(autoRaw.frequency)
    : fallback.frequency

  return {
    enabled: Boolean(autoRaw.enabled ?? fallback.enabled),
    allowedDays: days.length ? Array.from(new Set(days)) : fallback.allowedDays,
    startTime: typeof autoRaw.startTime === 'string' && HHMM.test(autoRaw.startTime) ? autoRaw.startTime : fallback.startTime,
    endTime: typeof autoRaw.endTime === 'string' && HHMM.test(autoRaw.endTime) ? autoRaw.endTime : fallback.endTime,
    frequency,
    maxSends: clampInt(autoRaw.maxSends, fallback.maxSends, 100),
    sendsPerDay: clampInt(autoRaw.sendsPerDay, fallback.sendsPerDay, 24),
  }
}

export function sanitizeAutoArchiveSettings(
  raw: unknown,
  fallback = DEFAULT_PENDENCY_SETTINGS.autoArchive,
): PendencyAutoArchiveSettings {
  const autoRaw = asRecord(raw)
  const unit = (AUTO_ARCHIVE_UNITS as readonly string[]).includes(String(autoRaw.afterUnit))
    ? String(autoRaw.afterUnit) as PendencyAutoArchiveUnit
    : fallback.afterUnit

  return {
    enabled: Boolean(autoRaw.enabled ?? fallback.enabled),
    afterValue: clampInt(autoRaw.afterValue, fallback.afterValue, 365),
    afterUnit: unit,
    onlyAfterManagerApproval: Boolean(autoRaw.onlyAfterManagerApproval ?? fallback.onlyAfterManagerApproval),
    onlyIfNotReopened: Boolean(autoRaw.onlyIfNotReopened ?? autoRaw.skipReopened ?? fallback.onlyIfNotReopened),
  }
}

function sanitizeSlaEngine(raw: unknown, fallback = DEFAULT_PENDENCY_SETTINGS.slaEngine): PendencySlaEngineSettings {
  const r = asRecord(raw)
  const req = Array.isArray(r.requireCommitFor)
    ? r.requireCommitFor.map(String).filter((p) => (PRIORITIES as readonly string[]).includes(p)) as PendencyPriorityKey[]
    : fallback.requireCommitFor
  return {
    enabled: Boolean(r.enabled ?? fallback.enabled),
    requireCommitFor: req.length ? Array.from(new Set(req)) : fallback.requireCommitFor,
    maxDefer: clampInt(r.maxDefer, fallback.maxDefer, 20),
    chargeIntervalHours: clampInt(r.chargeIntervalHours, fallback.chargeIntervalHours, 168),
    staleHours: clampInt(r.staleHours, fallback.staleHours, 168),
    overdueStrikesForCritical: clampInt(r.overdueStrikesForCritical, fallback.overdueStrikesForCritical, 10),
    criticalStaleHours: clampInt(r.criticalStaleHours, fallback.criticalStaleHours, 336),
    naggingL2Hours: clampInt(r.naggingL2Hours, fallback.naggingL2Hours, 336),
    naggingL3Hours: clampInt(r.naggingL3Hours, fallback.naggingL3Hours, 336),
    naggingPushIntervalMinutes: clampInt(r.naggingPushIntervalMinutes, fallback.naggingPushIntervalMinutes, 1440),
  }
}

export function sanitizePendencySettings(raw: unknown, fallback = DEFAULT_PENDENCY_SETTINGS): PendencySettings {
  const body = asRecord(raw)
  return {
    slaByPriority: sanitizeSla(body.slaByPriority, fallback.slaByPriority),
    slaEngine: sanitizeSlaEngine(body.slaEngine, fallback.slaEngine),
    autoSend: sanitizeAutoSend(body.autoSend, fallback.autoSend),
    autoArchive: sanitizeAutoArchiveSettings(body.autoArchive, fallback.autoArchive),
  }
}

export function mergePendencySettings(current: unknown, patch: unknown): PendencySettings {
  const base = sanitizePendencySettings(current)
  const patchRecord = asRecord(patch)
  const merged = {
    ...base,
    ...patchRecord,
    slaByPriority: { ...base.slaByPriority, ...asRecord(patchRecord.slaByPriority) },
    slaEngine: { ...base.slaEngine, ...asRecord(patchRecord.slaEngine) },
    autoSend: { ...base.autoSend, ...asRecord(patchRecord.autoSend) },
    autoArchive: { ...base.autoArchive, ...asRecord(patchRecord.autoArchive) },
  }
  return sanitizePendencySettings(merged, base)
}

export function pendencySettingsKeyForTenant(tenantId: string): string {
  return `t:${tenantId}:${PENDENCY_SETTINGS_KEY_BASE}`
}

export function pendencySettingsKeyForSession(role: string, tenantId: string | null | undefined): string {
  return role === 'MASTER' || !tenantId
    ? `global:${PENDENCY_SETTINGS_KEY_BASE}`
    : pendencySettingsKeyForTenant(tenantId)
}

export function tenantIdFromPendencySettingsKey(key: string): string | null {
  const match = /^t:([^:]+):pendency_settings$/.exec(key)
  return match?.[1] ?? null
}

export async function loadPendencySettingsByKey(key: string): Promise<PendencySettings> {
  const row = await prisma.systemSetting.findFirst({ where: { key }, select: { value: true } }).catch(() => null)
  if (!row?.value) return DEFAULT_PENDENCY_SETTINGS

  try {
    return sanitizePendencySettings(JSON.parse(row.value))
  } catch {
    return DEFAULT_PENDENCY_SETTINGS
  }
}

export async function loadTenantPendencySettings(tenantId: string): Promise<PendencySettings> {
  return loadPendencySettingsByKey(pendencySettingsKeyForTenant(tenantId))
}

export async function upsertPendencySettings(params: {
  key: string
  tenantId: string | null
  settings: PendencySettings
  updatedByUserId?: string | null
  description?: string
}): Promise<void> {
  const value = JSON.stringify(params.settings)
  const existing = await prisma.systemSetting.findFirst({ where: { key: params.key }, select: { id: true } })

  if (existing) {
    await prisma.systemSetting.update({
      where: { id: existing.id },
      data: {
        value,
        tenantId: params.tenantId,
        group: PENDENCY_SETTINGS_GROUP,
        updatedByUserId: params.updatedByUserId ?? null,
      },
    })
    return
  }

  await prisma.systemSetting.create({
    data: {
      key: params.key,
      value,
      tenantId: params.tenantId,
      description: params.description ?? 'Configurações da Central de Pendências',
      group: PENDENCY_SETTINGS_GROUP,
      updatedByUserId: params.updatedByUserId ?? null,
    },
  })
}
