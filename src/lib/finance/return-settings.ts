import { prisma } from '@/lib/prisma'
import type { ReturnDeductionBase, ReturnValueType } from '@/lib/finance/return-calc'

export type ReturnCalculationBase = 'FINANCED_AMOUNT'

export interface ReturnRangeSettings {
  minReturnPercent: number
  maxReturnPercent: number
  calculationBase: ReturnCalculationBase
  deductionBase: ReturnDeductionBase
  active: boolean
}

export interface CompetenceValueSetting {
  id: string
  month: number | null
  year: number | null
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
  ila: CompetenceValueSetting | null
  iof: CompetenceValueSetting | null
}

const RANGE_KEY = (tenantId: string) => `t:${tenantId}:return_settings`
const ILA_KEY = (tenantId: string) => `t:${tenantId}:ila_settings`
const IOF_KEY = (tenantId: string) => `t:${tenantId}:iof_settings`

export const DEFAULT_RETURN_RANGE: ReturnRangeSettings = {
  minReturnPercent: 1,
  maxReturnPercent: 6,
  calculationBase: 'FINANCED_AMOUNT',
  deductionBase: 'GROSS_RETURN',
  active: true,
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `cfg_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function cleanMoney(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function cleanMonth(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}

function cleanYear(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
}

export function normalizeCompetenceRows(rows: Array<Partial<CompetenceValueSetting>> | undefined, userId?: string | null): CompetenceValueSetting[] {
  return (rows ?? []).map((r) => ({
    id: r.id || id(),
    month: cleanMonth(r.month),
    year: cleanYear(r.year),
    value: cleanMoney(r.value),
    valueType: r.valueType === 'FIXO' ? 'FIXO' : 'PERCENTUAL',
    active: r.active !== false,
    notes: r.notes?.trim() || null,
    updatedAt: new Date().toISOString(),
    updatedById: userId ?? r.updatedById ?? null,
  }))
}

export function normalizeRange(input: Partial<ReturnRangeSettings> | undefined): ReturnRangeSettings {
  const minReturnPercent = Math.max(0, Number(input?.minReturnPercent ?? DEFAULT_RETURN_RANGE.minReturnPercent) || 0)
  const maxReturnPercent = Math.max(minReturnPercent + 0.01, Number(input?.maxReturnPercent ?? DEFAULT_RETURN_RANGE.maxReturnPercent) || DEFAULT_RETURN_RANGE.maxReturnPercent)
  return {
    minReturnPercent,
    maxReturnPercent,
    calculationBase: 'FINANCED_AMOUNT',
    deductionBase: input?.deductionBase === 'FINANCED_AMOUNT' ? 'FINANCED_AMOUNT' : 'GROSS_RETURN',
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
    iof: normalizeCompetenceRows(parseJson<CompetenceValueSetting[]>(map.get(IOF_KEY(tenantId)), [])),
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
    iof: normalizeCompetenceRows(input.iof, userId),
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

function globalIof(row: CompetenceValueSetting) {
  return row.active && row.month == null && row.year == null
}

export async function resolveReturnSettingsForDate(tenantId: string, date: Date): Promise<ResolvedReturnSettings> {
  const bundle = await getReturnSettingsBundle(tenantId)
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  const ila = bundle.ila.find((r) => sameCompetence(r, month, year)) ?? null
  const iof = bundle.iof.find((r) => sameCompetence(r, month, year)) ?? bundle.iof.find(globalIof) ?? null
  return {
    range: bundle.range,
    competence: { month, year, label: `${String(month).padStart(2, '0')}/${year}` },
    ila,
    iof,
  }
}
