// =============================================================================
// Tabela de reparos da avaliação por loja (SystemSetting
// `evaluation:repairs:<tenantId>`) com log de alterações em AuditLog
// (entity EvaluationRepairPrices). Regras em repair-prices-core.ts.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { DEFAULT_REPAIRS, diffRepairs, normalizeRepairs, type RepairOption } from './repair-prices-core'

const KEY = (tenantId: string) => `evaluation:repairs:${tenantId}`
export const REPAIR_AUDIT_ENTITY = 'EvaluationRepairPrices'

export async function loadRepairs(tenantId: string | null | undefined): Promise<RepairOption[]> {
  if (!tenantId) return DEFAULT_REPAIRS
  const row = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row?.value) return DEFAULT_REPAIRS
  try {
    const n = normalizeRepairs(JSON.parse(row.value))
    return n.ok ? n.data : DEFAULT_REPAIRS
  } catch { return DEFAULT_REPAIRS }
}

export async function saveRepairs(
  tenantId: string, raw: unknown, actor: { id: string; name: string | null; role: string },
): Promise<{ ok: true; data: RepairOption[]; changes: string[] } | { ok: false; error: string }> {
  const n = normalizeRepairs(raw)
  if (!n.ok) return n
  const before = await loadRepairs(tenantId)
  const changes = diffRepairs(before, n.data)
  if (!changes.length) return { ok: true, data: n.data, changes }
  const value = JSON.stringify(n.data)
  const existing = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value, updatedByUserId: actor.id } })
  else await prisma.systemSetting.create({ data: { key: KEY(tenantId), tenantId, value, group: 'evaluation', updatedByUserId: actor.id, description: 'Tabela de reparos da avaliação' } })
  await prisma.auditLog.create({
    data: {
      userId: actor.id, tenantId, action: 'UPDATE', entity: REPAIR_AUDIT_ENTITY, entityId: tenantId,
      userName: actor.name, userRole: actor.role, status: 'SUCCESS',
      beforeData: before as never, afterData: { repairs: n.data, changes } as never,
    },
  })
  return { ok: true, data: n.data, changes }
}

/** Histórico de alterações (mais recentes primeiro). */
export async function repairHistory(tenantId: string, take = 50) {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId, entity: REPAIR_AUDIT_ENTITY },
    orderBy: { createdAt: 'desc' }, take,
    select: { id: true, createdAt: true, userName: true, userRole: true, afterData: true },
  })
  return rows.map((r) => ({
    id: r.id, at: r.createdAt.toISOString(), user: r.userName, role: r.userRole,
    changes: ((r.afterData as { changes?: string[] } | null)?.changes ?? []),
  }))
}
