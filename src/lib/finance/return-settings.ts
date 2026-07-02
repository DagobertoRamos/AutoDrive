import { prisma } from '@/lib/prisma'
import type { ReturnDeductionBase, ReturnValueType } from '@/lib/finance/return-calc'

export type ReturnCalculationBase = 'FINANCED_AMOUNT'

export interface ReturnRangeSettings {
  minReturnPercent: number
  maxReturnPercent: number
  calculationBase: ReturnCalculationBase
  deductionBase: ReturnDeductionBase
  allowMissingIlaAsZero: boolean
  allowMissingIofAsZero: boolean
  active: boolean
}

export interface CompetenceValueSetting {
  id: string
  name?: string | null
  month: number | null
  year: number | null
  startsAt?: string | null
  endsAt?: string | null
  value: number
  valueType: ReturnValueType
  active: boolean
  notes: string | null
  updatedAt?: string
  updatedById?: string | null
}

export interface ReturnSettingsBundle {
  range: ReturnRangeSettings
  ila: CompetenceValueSetting[]
  iof: CompetenceValueSetting[]
}

export interface ReturnSettingsBundleInput {
  range?: Partial<ReturnRangeSettings>
  ila?: Array<Partial<CompetenceValueSetting>>
  iof?: Array<Partial<CompetenceValueSetting>>
}

export interface ResolvedReturnSettings {
  range: ReturnRangeSettings
  competence: { month: number; year: number; label: string }
  operationDate: Date
  ila: CompetenceValueSetting | null
  iof: CompetenceValueSetting | null
}

const RANGE_KEY = (tenantId: string) => `t:${tenantId}:return_settings`
const ILA_KEY = (tenantId: string) => `t:${tenantId}:ila_settings`
const IOF_KEY = (tenantId: string) => `t:${tenantId}:iof_settings`

export const DEFAULT_RETURN_RANGE: ReturnRangeSettings = {
  minReturnPercent: 0.01,
  maxReturnPercent: 20,
  calculationBase: 'FINANCED_AMOUNT',
  deductionBase: 'GROSS_RETURN',
  allowMissingIlaAsZero: false,
  allowMissingIofAsZero: false,
  active: true,
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `cfg_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function cleanNumber(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function cleanPercent(v: unknown): number {
  return Math.min(100, cleanNumber(v))
}

function cleanMonth(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}

function cleanYear(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
}

function cleanDateString(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const raw = v.trim().slice(0, 10)
  const d = new Date(`${raw}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : raw
}

function startOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function endOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function dayNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const d = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 86_400_000)
}

function effectiveStartsAt(row: Partial<CompetenceValueSetting>): string | null {
  const explicit = cleanDateString(row.startsAt)
  if (explicit) return explicit
  const month = cleanMonth(row.month)
  const year = cleanYear(row.year)
  return month && year ? startOfMonth(year, month) : null
}

function effectiveEndsAt(row: Partial<CompetenceValueSetting>): string | null {
  const explicit = cleanDateString(row.endsAt)
  if (explicit) return explicit
  const month = cleanMonth(row.month)
  const year = cleanYear(row.year)
  return month && year ? endOfMonth(year, month) : null
}

export function findActiveIofOverlap(rows: Array<Partial<CompetenceValueSetting>>): { firstIndex: number; secondIndex: number } | null {
  const activePeriods = rows
    .map((row, index) => {
      if (row.active === false) return null
      const startsAt = effectiveStartsAt(row)
      if (!startsAt) return null
      return {
        index,
        start: dayNumber(startsAt) ?? 0,
        end: dayNumber(effectiveEndsAt(row)) ?? Number.MAX_SAFE_INTEGER,
      }
    })
    .filter((row): row is { index: number; start: number; end: number } => Boolean(row))
    .sort((a, b) => a.start - b.start)

  for (let i = 1; i < activePeriods.length; i += 1) {
    const previous = activePeriods[i - 1]
    const current = activePeriods[i]
    if (current.start <= previous.end) {
      return { firstIndex: previous.index, secondIndex: current.index }
    }
  }
  return null
}

export function normalizeCompetenceRows(rows: Array<Partial<CompetenceValueSetting>> | undefined, userId?: string | null): CompetenceValueSetting[] {
  return (rows ?? []).map((r) => ({
    id: r.id || id(),
    name: r.name?.trim() || null,
    month: cleanMonth(r.month),
    year: cleanYear(r.year),
    startsAt: cleanDateString(r.startsAt),
    endsAt: cleanDateString(r.endsAt),
    value: cleanPercent(r.value),
    valueType: r.valueType === 'FIXO' ? 'FIXO' : 'PERCENTUAL',
    active: r.active !== false,
    notes: r.notes?.trim() || null,
    updatedAt: new Date().toISOString(),
    updatedById: userId ?? r.updatedById ?? null,
  }))
}

export function normalizeIofRows(rows: Array<Partial<CompetenceValueSetting>> | undefined, userId?: string | null): CompetenceValueSetting[] {
  return (rows ?? []).map((r) => {
    const month = cleanMonth(r.month)
    const year = cleanYear(r.year)
    const startsAt = effectiveStartsAt(r)
    return {
      id: r.id || id(),
      name: r.name?.trim() || null,
      month,
      year,
      startsAt,
      endsAt: effectiveEndsAt(r),
      value: cleanPercent(r.value),
      valueType: r.valueType === 'FIXO' ? 'FIXO' : 'PERCENTUAL',
      active: r.active !== false,
      notes: r.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
      updatedById: userId ?? r.updatedById ?? null,
    }
  })
}

export function normalizeRange(input: Partial<ReturnRangeSettings> | undefined): ReturnRangeSettings {
  const min = Number(input?.minReturnPercent ?? DEFAULT_RETURN_RANGE.minReturnPercent)
  const max = Number(input?.maxReturnPercent ?? DEFAULT_RETURN_RANGE.maxReturnPercent)
  const minReturnPercent = Number.isFinite(min) ? Math.max(0.01, min) : DEFAULT_RETURN_RANGE.minReturnPercent
  const maxReturnPercent = Number.isFinite(max) ? Math.min(20, Math.max(minReturnPercent + 0.01, max)) : DEFAULT_RETURN_RANGE.maxReturnPercent
  return {
    minReturnPercent,
    maxReturnPercent,
    calculationBase: 'FINANCED_AMOUNT',
    deductionBase: 'GROSS_RETURN',
    allowMissingIlaAsZero: input?.allowMissingIlaAsZero === true,
    allowMissingIofAsZero: input?.allowMissingIofAsZero === true,
    active: input?.active !== false,
  }
}

export async function getReturnSettingsBundle(tenantId: string): Promise<ReturnSettingsBundle> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [RANGE_KEY(tenantId), ILA_KEY(tenantId), IOF_KEY(tenantId)] } },
    select: { key: true, value: true },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    range: normalizeRange(parseJson<Partial<ReturnRangeSettings>>(map.get(RANGE_KEY(tenantId)), DEFAULT_RETURN_RANGE)),
    ila: normalizeCompetenceRows(parseJson<CompetenceValueSetting[]>(map.get(ILA_KEY(tenantId)), [])),
    iof: normalizeIofRows(parseJson<CompetenceValueSetting[]>(map.get(IOF_KEY(tenantId)), [])),
  }
}

async function upsertSetting(tenantId: string, key: string, value: unknown, updatedByUserId: string) {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: JSON.stringify(value), updatedByUserId },
    create: {
      tenantId,
      key,
      value: JSON.stringify(value),
      updatedByUserId,
      group: 'financing.return',
      description: 'Configuração de retorno/F&I por tenant.',
    },
  })
}

export async function saveReturnSettingsBundle(tenantId: string, input: ReturnSettingsBundleInput, userId: string): Promise<ReturnSettingsBundle> {
  const bundle = {
    range: normalizeRange(input.range),
    ila: normalizeCompetenceRows(input.ila, userId),
    iof: normalizeIofRows(input.iof, userId),
  }
  await Promise.all([
    upsertSetting(tenantId, RANGE_KEY(tenantId), bundle.range, userId),
    upsertSetting(tenantId, ILA_KEY(tenantId), bundle.ila, userId),
    upsertSetting(tenantId, IOF_KEY(tenantId), bundle.iof, userId),
  ])
  return bundle
}

function sameCompetence(row: CompetenceValueSetting, month: number, year: number) {
  return row.active && row.month === month && row.year === year
}

function dateInIofPeriod(row: CompetenceValueSetting, date: Date) {
  if (!row.active) return false
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  const start = dayNumber(effectiveStartsAt(row))
  if (start == null) return row.month == null && row.year == null
  const end = dayNumber(effectiveEndsAt(row)) ?? Number.MAX_SAFE_INTEGER
  return day >= start && day <= end
}

export async function resolveReturnSettingsForDate(tenantId: string, date: Date): Promise<ResolvedReturnSettings> {
  const bundle = await getReturnSettingsBundle(tenantId)
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  const ila = bundle.ila.find((r) => sameCompetence(r, month, year)) ?? null
  const iof = bundle.iof.find((r) => dateInIofPeriod(r, date)) ?? null
  return {
    range: bundle.range,
    competence: { month, year, label: `${String(month).padStart(2, '0')}/${year}` },
    operationDate: date,
    ila,
    iof,
  }
}
