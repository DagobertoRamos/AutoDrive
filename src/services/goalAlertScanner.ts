// =============================================================================
// goalAlertScanner.ts — Avisos de "meta abaixo do esperado" (AutoDrive)
//
// Varre metas ATIVAS dentro do período, calcula o progresso (service layer) e,
// quando o realizado está significativamente atrás do ritmo esperado, dispara
// um aviso ao responsável reusando o NotificationService existente.
// Idempotente: 1 aviso por meta por período (dedupe via metadata.goalId).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { computeGoalProgress } from '@/lib/goals/service'
import { notify, notifyByRole } from '@/services/notification.service'

// Só alerta após este % do período decorrido (evita alarme cedo demais).
const MIN_ELAPSED = 0.25
// Alerta se o realizado < (ritmo esperado * MARGIN). Ex.: aos 50% do período,
// esperado ~50%; alerta se realizado < 40% (50% * 0.8).
const PACE_MARGIN = 0.8

const TYPE_LABEL: Record<string, string> = {
  SALES_EXCHANGE: 'Vendas e Trocas', PURCHASE: 'Compras', RETURN: 'Retornos',
  DOCUMENTATION: 'Documentação', EXTENDED_WARRANTY: 'Garantia Estendida', SERVICE: 'Serviços',
}
const SCOPE_LABEL: Record<string, string> = {
  USER: 'individual', UNIT: 'da unidade', TENANT: 'da loja', GLOBAL: 'global',
}

export interface GoalAlertReport {
  tenantId: string
  scanned:  number
  created:  number
  skipped:  number
  errors:   string[]
}

/** Já existe aviso para esta meta no período atual? (idempotência) */
async function alreadyAlerted(tenantId: string | null, goalId: string, since: Date): Promise<boolean> {
  const existing = await prisma.notification
    .findFirst({
      where: {
        ...(tenantId ? { tenantId } : {}),
        createdAt: { gte: since },
        metadata: { path: ['goalId'], equals: goalId } as never,
      },
      select: { id: true },
    })
    .catch(() => null)
  return !!existing
}

async function dispatchAlert(goal: {
  id: string; tenantId: string | null; unitId: string | null; userId: string | null
  type: string; scope: string
}, percent: number, target: number, achieved: number): Promise<boolean> {
  const label = TYPE_LABEL[goal.type] ?? goal.type
  const title = 'Meta abaixo do esperado'
  const message = `A meta ${SCOPE_LABEL[goal.scope] ?? ''} de ${label} está em ${Math.round(percent)}% (${achieved} de ${target}). Acelere para alcançar o objetivo.`
  const metadata = { goalId: goal.id, type: 'GOAL_BELOW', scope: goal.scope, percent: Math.round(percent) }

  if (goal.scope === 'USER' && goal.userId) {
    await notify({ userId: goal.userId, tenantId: goal.tenantId, type: 'SISTEMA', title, message, actionUrl: '/dashboard', metadata, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] })
    return true
  }
  if (goal.tenantId && (goal.scope === 'UNIT' || goal.scope === 'TENANT')) {
    await notifyByRole({
      tenantId: goal.tenantId,
      roles: ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE'],
      ...(goal.scope === 'UNIT' && goal.unitId ? { unitId: goal.unitId } : {}),
      type: 'SISTEMA', title, message, actionUrl: '/desempenho', metadata, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
    })
    return true
  }
  return false // GLOBAL ou sem destinatário
}

/** Varre as metas ativas de um tenant e cria avisos para as atrasadas. */
export async function scanGoalAlertsForTenant(tenantId: string, now: Date = new Date()): Promise<GoalAlertReport> {
  const report: GoalAlertReport = { tenantId, scanned: 0, created: 0, skipped: 0, errors: [] }

  const goals = await prisma.goal.findMany({
    where: { tenantId, status: 'ATIVA', active: true, startDate: { lte: now }, endDate: { gte: now } },
    include: { levels: { orderBy: { level: 'asc' } } },
  })

  for (const goal of goals) {
    report.scanned++
    try {
      const start = goal.startDate.getTime()
      const end = goal.endDate.getTime()
      const elapsed = end > start ? (now.getTime() - start) / (end - start) : 1
      if (elapsed < MIN_ELAPSED) { report.skipped++; continue }

      const progress = await computeGoalProgress(goal, now)
      if (progress.reached) { report.skipped++; continue }

      const expectedPct = elapsed * 100
      if (progress.percent >= expectedPct * PACE_MARGIN) { report.skipped++; continue }

      if (await alreadyAlerted(goal.tenantId, goal.id, goal.startDate)) { report.skipped++; continue }

      const sent = await dispatchAlert(goal, progress.percent, progress.target, progress.achievedValue)
      if (sent) report.created++
      else report.skipped++
    } catch (err) {
      report.errors.push(`goal ${goal.id}: ${err instanceof Error ? err.message : 'erro'}`)
    }
  }

  return report
}

/** Varre todos os tenants ativos (uso do MASTER / cron). */
export async function scanAllGoalAlerts(now: Date = new Date()): Promise<GoalAlertReport[]> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } })
  const out: GoalAlertReport[] = []
  for (const t of tenants) {
    out.push(await scanGoalAlertsForTenant(t.id, now))
  }
  return out
}
