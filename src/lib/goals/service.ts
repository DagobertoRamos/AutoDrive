// =============================================================================
// goals/service.ts — Camada de serviço de Metas (AutoDrive)
//
// Centraliza: resolução de escopo, cálculo de progresso, progressão de níveis
// (sem hardcode), RBAC de leitura e filtros multi-tenant. As rotas só orquestram
// — nenhuma regra de cálculo vive no front-end ou nas rotas.
// =============================================================================

import type { Goal, GoalLevel, UserRole } from '@prisma/client'
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
 * - Demais (vendedor/usuário): suas metas USER + metas da sua unidade + do tenant.
 */
export function goalReadWhere(user: SessionUser): Record<string, unknown> {
  if (user.role === 'MASTER') return {}
  if (canManageGoals(user.role)) return { tenantId: user.tenantId }

  return {
    tenantId: user.tenantId,
    OR: [
      { scope: 'USER', userId: user.id },
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
  if (goal.scope === 'USER') return goal.userId === user.id
  return false
}

// ── Escopo de agregação ───────────────────────────────────────────────────────

/** Resolve o escopo de agregação a partir da meta (deriva sellerId do userId). */
export async function resolveAggregationScope(goal: Goal): Promise<AggregationScope> {
  const scope: AggregationScope = { tenantId: goal.tenantId }

  if (goal.scope === 'UNIT') scope.unitId = goal.unitId
  if (goal.scope === 'USER' && goal.userId) {
    const seller = await prisma.seller.findUnique({
      where: { userId: goal.userId },
      select: { id: true },
    })
    scope.sellerId = seller?.id ?? NO_SELLER
  }
  return scope
}

/** Janela de apuração da meta (datas explícitas da própria meta). */
export function goalWindow(goal: Goal): AggregationWindow {
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
): Promise<GoalProgressResult> {
  const levels = goal.levels ?? []
  const scope = await resolveAggregationScope(goal)
  const { value: achievedValue, note } = await aggregateAchieved(goal.type, scope, goalWindow(goal))

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
): Promise<GoalProgressResult> {
  const result = await computeGoalProgress(goal, now)

  const existing = await prisma.goalProgress.findUnique({
    where: { goalId_periodStart: { goalId: goal.id, periodStart: goal.startDate } },
    select: { reachedAt: true },
  })
  const reachedAt = existing?.reachedAt ?? (result.reached ? now : null)

  await prisma.goalProgress.upsert({
    where: { goalId_periodStart: { goalId: goal.id, periodStart: goal.startDate } },
    create: {
      goalId:        goal.id,
      tenantId:      goal.tenantId,
      unitId:        goal.unitId,
      userId:        goal.userId,
      periodStart:   goal.startDate,
      periodEnd:     goal.endDate,
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
