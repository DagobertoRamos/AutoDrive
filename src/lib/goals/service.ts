// =============================================================================
// goals/service.ts — Camada de serviço de Metas (AutoDrive)
//
// Centraliza: resolução de escopo, cálculo de progresso, progressão de níveis
// (sem hardcode), RBAC de leitura e filtros multi-tenant. As rotas só orquestram
// — nenhuma regra de cálculo vive no front-end ou nas rotas.
// =============================================================================

import type { Goal, GoalLevel, UserRole, GoalType, GoalPeriod } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { MANAGEMENT_ROLES, type SessionUser } from '@/lib/auth-guards'
import {
  aggregateAchieved,
  type AggregationScope,
  type AggregationWindow,
} from '@/lib/goals/aggregators'

/** Sentinela: força contagem zero quando um vendedor não tem cadastro Seller. */
const NO_SELLER = '__no_seller__'

// ── RBAC ────────────────────────────────────────────────────────────────────

/** Quem pode criar/editar/excluir/configurar metas. */
export function canManageGoals(role: UserRole): boolean {
  return MANAGEMENT_ROLES.includes(role)
}

/**
 * Filtro Prisma das metas que um usuário PODE LER.
 * - MASTER: tudo.
 * - Gestão (ADM/GERENTE_GERAL/GERENTE): todas do seu tenant.
 * - Demais (vendedor/usuário): suas metas USER + metas de cargo ROLE + metas da sua unidade + do tenant.
 */
export function goalReadWhere(user: SessionUser): Record<string, unknown> {
  if (user.role === 'MASTER') return {}
  if (canManageGoals(user.role)) return { tenantId: user.tenantId }

  return {
    tenantId: user.tenantId,
    OR: [
      { scope: 'USER', userId: user.id },
      { scope: 'ROLE', targetRole: user.role },
      { scope: 'UNIT', unitId: user.unitId },
      { scope: 'TENANT' },
    ],
  }
}

/** Verifica se o usuário pode ler uma meta específica. */
export function canReadGoal(user: SessionUser, goal: Goal): boolean {
  if (user.role === 'MASTER') return true
  if (goal.tenantId && goal.tenantId !== user.tenantId) return false
  if (canManageGoals(user.role)) return true
  if (goal.scope === 'TENANT') return true
  if (goal.scope === 'UNIT') return goal.unitId === user.unitId
  if (goal.scope === 'ROLE') return goal.targetRole === user.role
  if (goal.scope === 'USER') return goal.userId === user.id
  return false
}

// ── Escopo de agregação ───────────────────────────────────────────────────────

/** Resolve o escopo de agregação a partir da meta (deriva sellerId do userId ou forUserId). */
export async function resolveAggregationScope(goal: Goal, forUserId?: string): Promise<AggregationScope> {
  const scope: AggregationScope = { tenantId: goal.tenantId }

  if (goal.scope === 'UNIT') scope.unitId = goal.unitId
  if (goal.scope === 'USER' && goal.userId) {
    const seller = await prisma.seller.findUnique({
      where: { userId: goal.userId },
      select: { id: true },
    })
    scope.sellerId = seller?.id ?? NO_SELLER
  } else if (goal.scope === 'ROLE' && forUserId) {
    const seller = await prisma.seller.findUnique({
      where: { userId: forUserId },
      select: { id: true },
    })
    scope.sellerId = seller?.id ?? NO_SELLER
  }
  return scope
}

// ── Períodos dinâmicos ────────────────────────────────────────────────────────

interface GoalPeriodResult {
  startsAt: Date
  endsAt: Date
  periodKey: string
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return weekNo
}

function parseInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timezone = 'America/Sao_Paulo',
): Date {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms))
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })
  const parts = formatter.formatToParts(utcDate)
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]))

  const tzYear = parseInt(partMap.year, 10)
  const tzMonth = parseInt(partMap.month, 10)
  const tzDay = parseInt(partMap.day, 10)
  const tzHour = parseInt(partMap.hour, 10) === 24 ? 0 : parseInt(partMap.hour, 10)
  const tzMinute = parseInt(partMap.minute, 10)
  const tzSecond = parseInt(partMap.second, 10)

  const tzUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond, ms)
  const offsetMs = utcDate.getTime() - tzUtc
  return new Date(utcDate.getTime() + offsetMs)
}

export function getGoalPeriod({
  frequency,
  referenceDate,
  timezone = 'America/Sao_Paulo',
}: {
  frequency: string
  referenceDate: Date
  timezone?: string
}): GoalPeriodResult {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(referenceDate)
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]))

  const year = parseInt(partMap.year, 10)
  const month = parseInt(partMap.month, 10) // 1-12
  const day = parseInt(partMap.day, 10)

  let startsAt: Date
  let endsAt: Date
  let periodKey: string

  const freqLower = frequency.toLowerCase()

  if (freqLower === 'monthly') {
    startsAt = parseInTimezone(year, month, 1, 0, 0, 0, 0, timezone)
    const lastDay = new Date(year, month, 0).getDate()
    endsAt = parseInTimezone(year, month, lastDay, 23, 59, 59, 999, timezone)
    periodKey = `${year}-${String(month).padStart(2, '0')}`
  } else if (freqLower === 'daily') {
    startsAt = parseInTimezone(year, month, day, 0, 0, 0, 0, timezone)
    endsAt = parseInTimezone(year, month, day, 23, 59, 59, 999, timezone)
    periodKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  } else if (freqLower === 'weekly') {
    const refLocal = parseInTimezone(year, month, day, 0, 0, 0, 0, timezone)
    const dayOfWeek = refLocal.getDay() // 0=Sunday
    const sundayDate = new Date(refLocal)
    sundayDate.setDate(refLocal.getDate() - dayOfWeek)

    const sunFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    const sunParts = Object.fromEntries(sunFormatter.formatToParts(sundayDate).map((p) => [p.type, p.value]))
    const sYear = parseInt(sunParts.year, 10)
    const sMonth = parseInt(sunParts.month, 10)
    const sDay = parseInt(sunParts.day, 10)

    startsAt = parseInTimezone(sYear, sMonth, sDay, 0, 0, 0, 0, timezone)

    const saturdayDate = new Date(startsAt)
    saturdayDate.setDate(startsAt.getDate() + 6)

    const satParts = Object.fromEntries(sunFormatter.formatToParts(saturdayDate).map((p) => [p.type, p.value]))
    const satYear = parseInt(satParts.year, 10)
    const satMonth = parseInt(satParts.month, 10)
    const satDay = parseInt(satParts.day, 10)

    endsAt = parseInTimezone(satYear, satMonth, satDay, 23, 59, 59, 999, timezone)
    periodKey = `${sYear}-W${getWeekNumber(startsAt)}`
  } else if (freqLower === 'quarterly') {
    const q = Math.floor((month - 1) / 3) // 0-3
    const startMonth = q * 3 + 1
    const endMonth = q * 3 + 3
    startsAt = parseInTimezone(year, startMonth, 1, 0, 0, 0, 0, timezone)
    const lastDay = new Date(year, endMonth, 0).getDate()
    endsAt = parseInTimezone(year, endMonth, lastDay, 23, 59, 59, 999, timezone)
    periodKey = `${year}-Q${q + 1}`
  } else if (freqLower === 'yearly') {
    startsAt = parseInTimezone(year, 1, 1, 0, 0, 0, 0, timezone)
    endsAt = parseInTimezone(year, 12, 31, 23, 59, 59, 999, timezone)
    periodKey = `${year}`
  } else {
    startsAt = referenceDate
    endsAt = referenceDate
    periodKey = 'custom'
  }

  return { startsAt, endsAt, periodKey }
}

/** Janela de apuração da meta (datas explícitas da própria meta ou dinâmicas para recorrentes). */
export function goalWindow(goal: Goal, referenceDate: Date = new Date()): AggregationWindow {
  if (goal.period !== 'CUSTOM') {
    const { startsAt, endsAt } = getGoalPeriod({ frequency: goal.period, referenceDate })
    return { start: startsAt, end: endsAt }
  }
  return { start: goal.startDate, end: goal.endDate }
}

// ── Progressão de níveis (sem hardcode) ────────────────────────────────────────

/**
 * Determina o nível atual alcançado.
 * - Progressiva: maior nível cujo alvo já foi atingido (0 se nenhum).
 * - Simples: 1 se atingiu o alvo base, senão 0.
 */
export function currentLevel(
  achieved: number,
  baseTarget: number,
  progressive: boolean,
  levels: Pick<GoalLevel, 'level' | 'targetValue'>[],
): number {
  if (!progressive || levels.length === 0) {
    return baseTarget > 0 && achieved >= baseTarget ? 1 : 0
  }
  const sorted = [...levels].sort((a, b) => a.level - b.level)
  let reached = 0
  for (const lvl of sorted) {
    if (achieved >= Number(lvl.targetValue)) reached = lvl.level
    else break
  }
  return reached
}

/** Alvo do próximo nível a ser desbloqueado (null se já no topo ou meta simples). */
export function nextLevelTarget(
  achieved: number,
  progressive: boolean,
  levels: Pick<GoalLevel, 'level' | 'targetValue'>[],
): number | null {
  if (!progressive || levels.length === 0) return null
  const sorted = [...levels].sort((a, b) => a.level - b.level)
  const next = sorted.find((l) => achieved < Number(l.targetValue))
  return next ? Number(next.targetValue) : null
}

// ── Resolução de meta por prioridade/cargo ────────────────────────────────────

export async function resolveGoalForUser({
  userId,
  role,
  unitId,
  tenantId,
  type,
  period,
  referenceDate = new Date(),
}: {
  userId: string
  role: UserRole
  unitId?: string | null
  tenantId?: string | null
  type: GoalType
  period: GoalPeriod
  referenceDate?: Date
}): Promise<Goal | null> {
  const goals = await prisma.goal.findMany({
    where: {
      tenantId,
      type,
      period,
      status: 'ATIVA',
      active: true,
    },
    include: { levels: { orderBy: { level: 'asc' } } },
  })

  const activeGoals = goals.filter((g) => {
    if (g.period === 'MONTHLY') {
      const { startsAt } = getGoalPeriod({ frequency: 'monthly', referenceDate: g.startDate })
      return referenceDate >= startsAt
    }
    return referenceDate >= g.startDate && referenceDate <= g.endDate
  })

  // 1. User Specific (scope = USER, userId = userId)
  const userGoal = activeGoals.find((g) => g.scope === 'USER' && g.userId === userId)
  if (userGoal) return userGoal

  // 2. Role Specific (scope = ROLE, targetRole = role)
  const roleGoal = activeGoals.find((g) => g.scope === 'ROLE' && g.targetRole === role)
  if (roleGoal) return roleGoal

  // 3. Unit Specific (scope = UNIT, unitId = unitId)
  const unitGoal = activeGoals.find((g) => g.scope === 'UNIT' && g.unitId === unitId)
  if (unitGoal) return unitGoal

  // 4. Tenant Specific (scope = TENANT)
  const tenantGoal = activeGoals.find((g) => g.scope === 'TENANT')
  if (tenantGoal) return tenantGoal

  return null
}

// ── Cálculo de progresso ────────────────────────────────────────────────────────

export interface GoalProgressResult {
  goalId:        string
  target:        number
  achievedValue: number
  percent:       number
  currentLevel:  number
  nextTarget:    number | null
  reached:       boolean
  reachedAt:     Date | null
  note?:         string
}

type GoalWithLevels = Goal & { levels?: GoalLevel[] }

/** Calcula o progresso de uma meta (não persiste). */
export async function computeGoalProgress(
  goal: GoalWithLevels,
  now: Date,
  forUserId?: string,
): Promise<GoalProgressResult> {
  const levels = goal.levels ?? []
  const scope = await resolveAggregationScope(goal, forUserId)
  const window = goalWindow(goal, now)
  const { value: achievedValue, note } = await aggregateAchieved(goal.type, scope, window)

  const target = Number(goal.targetValue)
  const percent = target > 0 ? Math.round((achievedValue / target) * 10000) / 100 : 0
  const level = currentLevel(achievedValue, target, goal.progressive, levels)
  const reached = target > 0 && achievedValue >= target

  return {
    goalId:        goal.id,
    target,
    achievedValue,
    percent,
    currentLevel:  level,
    nextTarget:    nextLevelTarget(achievedValue, goal.progressive, levels),
    reached,
    reachedAt:     reached ? now : null,
    note,
  }
}

/**
 * Calcula e PERSISTE o snapshot de progresso (uma linha por meta+período).
 * Preserva o primeiro reachedAt já registrado.
 */
export async function persistGoalProgress(
  goal: GoalWithLevels,
  now: Date,
  forUserId?: string,
): Promise<GoalProgressResult> {
  const result = await computeGoalProgress(goal, now, forUserId)
  const window = goalWindow(goal, now)

  const existing = await prisma.goalProgress.findUnique({
    where: { goalId_periodStart: { goalId: goal.id, periodStart: window.start } },
    select: { reachedAt: true },
  })
  const reachedAt = existing?.reachedAt ?? (result.reached ? now : null)

  await prisma.goalProgress.upsert({
    where: { goalId_periodStart: { goalId: goal.id, periodStart: window.start } },
    create: {
      goalId:        goal.id,
      tenantId:      goal.tenantId,
      unitId:        goal.unitId,
      userId:        goal.scope === 'USER' ? goal.userId : (goal.scope === 'ROLE' ? forUserId : null),
      periodStart:   window.start,
      periodEnd:     window.end,
      achievedValue: result.achievedValue,
      percent:       result.percent,
      currentLevel:  result.currentLevel,
      reachedAt,
      computedAt:    now,
    },
    update: {
      achievedValue: result.achievedValue,
      percent:       result.percent,
      currentLevel:  result.currentLevel,
      reachedAt,
      computedAt:    now,
    },
  })

  return { ...result, reachedAt }
}
