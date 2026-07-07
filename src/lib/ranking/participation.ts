// =============================================================================
// ranking/participation.ts — quem participa de cada ranking.
// Compatível com o modelo antigo (listas de excluídos em SystemSetting) e com a
// configuração granular por tipo/unidade. Sem registro explícito = participa,
// preservando o comportamento existente.
// =============================================================================

import type { UserRole, UserStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const RANKING_TYPES = ['GENERAL', 'UNIT', 'ATTENDANCE', 'QUALITY', 'SALES', 'CONVERSION', 'QUEUE', 'CRM', 'COMMISSION'] as const
export type RankingType = typeof RANKING_TYPES[number]
export const UNIT_SCOPED_RANKING_TYPES: RankingType[] = ['UNIT', 'ATTENDANCE', 'QUALITY', 'QUEUE']

export interface RankingParticipationRecord {
  userId: string
  unitId: string | null
  rankingType: RankingType
  participates: boolean
  updatedByUserId?: string | null
  updatedAt?: string
}

export interface RankingParticipationTarget {
  tenantId: string
  unitId?: string | null
  rankingType: RankingType
}

export interface EligibleRankingUser {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  unitId: string | null
  unitName: string | null
  participates: boolean
  explicit: boolean
}

const USERS_KEY = (tenantId: string) => `t:${tenantId}:ranking_excluded_users`
const UNITS_KEY = (tenantId: string) => `t:${tenantId}:ranking_excluded_units`
const PARTICIPANTS_KEY = (tenantId: string) => `t:${tenantId}:ranking_participants_v2`

export const RANKING_TYPE_LABELS: Record<RankingType, string> = {
  GENERAL: 'Ranking Geral',
  UNIT: 'Ranking da Unidade',
  ATTENDANCE: 'Ranking de Atendimento',
  QUALITY: 'Ranking de Qualidade',
  SALES: 'Ranking de Vendas',
  CONVERSION: 'Ranking de Conversão',
  QUEUE: 'Ranking da Fila',
  CRM: 'Ranking CRM',
  COMMISSION: 'Ranking de Comissão',
}

export const RANKING_CONFIG_ROLES: UserRole[] = [
  'ADM',
  'GERENTE_GERAL',
  'GERENTE_ADMINISTRATIVO',
  'GERENTE',
  'VENDEDOR_LIDER',
  'VENDEDOR',
  'USUARIO_LIDER',
  'USUARIO',
]

async function readList(key: string): Promise<string[]> {
  try {
    const row = await prisma.systemSetting.findFirst({ where: { key }, select: { value: true } })
    if (!row?.value) return []
    const arr = JSON.parse(row.value)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

async function writeList(key: string, list: string[]): Promise<void> {
  const value = JSON.stringify([...new Set(list)])
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key, value, group: 'ranking' } })
}

function coerceRankingType(value: unknown): RankingType {
  return RANKING_TYPES.includes(value as RankingType) ? value as RankingType : 'GENERAL'
}

export function isRankingType(value: unknown): value is RankingType {
  return typeof value === 'string' && RANKING_TYPES.includes(value as RankingType)
}

export function isUnitScopedRankingType(rankingType: RankingType): boolean {
  return UNIT_SCOPED_RANKING_TYPES.includes(rankingType)
}

function coerceRecord(value: unknown): RankingParticipationRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.userId !== 'string' || !raw.userId) return null
  return {
    userId: raw.userId,
    unitId: typeof raw.unitId === 'string' && raw.unitId ? raw.unitId : null,
    rankingType: coerceRankingType(raw.rankingType),
    participates: raw.participates !== false,
    updatedByUserId: typeof raw.updatedByUserId === 'string' ? raw.updatedByUserId : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  }
}

async function readRecords(tenantId: string): Promise<RankingParticipationRecord[]> {
  try {
    const row = await prisma.systemSetting.findFirst({ where: { key: PARTICIPANTS_KEY(tenantId) }, select: { value: true } })
    if (!row?.value) return []
    const arr = JSON.parse(row.value)
    return Array.isArray(arr) ? arr.map(coerceRecord).filter((x): x is RankingParticipationRecord => Boolean(x)) : []
  } catch { return [] }
}

async function writeRecords(tenantId: string, records: RankingParticipationRecord[]): Promise<void> {
  const value = JSON.stringify(records)
  const key = PARTICIPANTS_KEY(tenantId)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key, value, group: 'ranking' } })
}

/** userIds que NÃO participam do ranking legado/global. */
export function getRankingExcludedUsers(tenantId: string): Promise<string[]> {
  return readList(USERS_KEY(tenantId))
}

/** unitIds que NÃO participam do ranking legado/global. */
export function getRankingExcludedUnits(tenantId: string): Promise<string[]> {
  return readList(UNITS_KEY(tenantId))
}

export async function setUserRankingParticipation(tenantId: string, userId: string, participates: boolean): Promise<void> {
  const current = await getRankingExcludedUsers(tenantId)
  const next = participates ? current.filter((id) => id !== userId) : [...current, userId]
  await writeList(USERS_KEY(tenantId), next)
}

export async function setUnitRankingParticipation(tenantId: string, unitId: string, participates: boolean): Promise<void> {
  const current = await getRankingExcludedUnits(tenantId)
  const next = participates ? current.filter((id) => id !== unitId) : [...current, unitId]
  await writeList(UNITS_KEY(tenantId), next)
}

export async function getRankingParticipantsConfig(target: RankingParticipationTarget): Promise<RankingParticipationRecord[]> {
  const records = await readRecords(target.tenantId)
  return records.filter((record) =>
    record.rankingType === target.rankingType &&
    (record.unitId ?? null) === (target.unitId ?? null),
  )
}

export async function updateRankingParticipantsConfig(opts: RankingParticipationTarget & {
  participants: { userId: string; participates: boolean }[]
  updatedByUserId?: string | null
}): Promise<{ before: RankingParticipationRecord[]; after: RankingParticipationRecord[] }> {
  const all = await readRecords(opts.tenantId)
  const scope = { unitId: opts.unitId ?? null, rankingType: opts.rankingType }
  const before = all.filter((record) => record.rankingType === scope.rankingType && (record.unitId ?? null) === scope.unitId)
  const incoming = new Map(opts.participants.map((item) => [item.userId, item.participates !== false]))
  const now = new Date().toISOString()
  const kept = all.filter((record) => !(record.rankingType === scope.rankingType && (record.unitId ?? null) === scope.unitId && incoming.has(record.userId)))
  const nextRecords: RankingParticipationRecord[] = [
    ...kept,
    ...[...incoming.entries()].map(([userId, participates]) => ({
      userId,
      unitId: scope.unitId,
      rankingType: scope.rankingType,
      participates,
      updatedByUserId: opts.updatedByUserId ?? null,
      updatedAt: now,
    })),
  ]
  await writeRecords(opts.tenantId, nextRecords)
  const after = nextRecords.filter((record) => record.rankingType === scope.rankingType && (record.unitId ?? null) === scope.unitId)
  return { before, after }
}

export async function restoreRankingParticipantsDefault(target: RankingParticipationTarget): Promise<RankingParticipationRecord[]> {
  const all = await readRecords(target.tenantId)
  const before = all.filter((record) =>
    record.rankingType === target.rankingType &&
    (record.unitId ?? null) === (target.unitId ?? null),
  )
  await writeRecords(target.tenantId, all.filter((record) => !(
    record.rankingType === target.rankingType &&
    (record.unitId ?? null) === (target.unitId ?? null)
  )))
  return before
}

export async function isUserIncludedInRanking(opts: RankingParticipationTarget & { userId: string }): Promise<boolean> {
  const records = await getRankingParticipantsConfig(opts)
  const explicit = records.find((record) => record.userId === opts.userId)
  if (explicit) return explicit.participates
  const legacyExcluded = await getRankingExcludedUsers(opts.tenantId)
  return !legacyExcluded.includes(opts.userId)
}

export async function applyRankingParticipationFilter<T extends { userId?: string; sellerId?: string }>(
  rows: T[],
  target: RankingParticipationTarget,
): Promise<T[]> {
  const records = await getRankingParticipantsConfig(target)
  const explicit = new Map(records.map((record) => [record.userId, record.participates]))
  const legacyExcluded = new Set(await getRankingExcludedUsers(target.tenantId))
  return rows.filter((row) => {
    const userId = row.userId ?? row.sellerId
    if (!userId) return true
    if (explicit.has(userId)) return explicit.get(userId)
    return !legacyExcluded.has(userId)
  })
}

export async function getEligibleUsersForRankingConfig(opts: {
  tenantId: string
  unitId?: string | null
  rankingType: RankingType
  includeInactive?: boolean
  role?: string | null
  search?: string | null
}): Promise<EligibleRankingUser[]> {
  const records = await getRankingParticipantsConfig(opts)
  const explicit = new Map(records.map((record) => [record.userId, record.participates]))
  const legacyExcluded = new Set(await getRankingExcludedUsers(opts.tenantId))
  const search = opts.search?.trim()
  const users = await prisma.user.findMany({
    where: {
      tenantId: opts.tenantId,
      ...(opts.unitId ? { unitId: opts.unitId } : {}),
      ...(opts.includeInactive ? {} : { status: 'ATIVO' }),
      role: opts.role ? opts.role as UserRole : { in: RANKING_CONFIG_ROLES },
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      unitId: true,
      unit: { select: { name: true } },
    },
    orderBy: [{ unit: { name: 'asc' } }, { name: 'asc' }],
    take: 500,
  })

  return users.map((user) => {
    const hasExplicit = explicit.has(user.id)
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      unitId: user.unitId,
      unitName: user.unit?.name ?? null,
      participates: hasExplicit ? explicit.get(user.id) !== false : !legacyExcluded.has(user.id),
      explicit: hasExplicit,
    }
  })
}
