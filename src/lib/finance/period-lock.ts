// =============================================================================
// Fechamento de período do financeiro (por loja).
//   SystemSetting `finance:closedUntil:<tenantId>` = 'YYYY-MM-DD' (último dia fechado).
//   Fechado = nenhum movimento realizado (data da baixa) nem competência dentro
//   do período pode ser criado, alterado, estornado ou cancelado. Ajustes entram
//   como lançamento novo no período aberto. Fechar/reabrir: ADM/MASTER, com
//   motivo na reabertura e registro em AuditLog (FINANCE_PERIOD_CLOSE/REOPEN).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'

const KEY = (tenantId: string) => `finance:closedUntil:${tenantId}`
const YMD = /^\d{4}-\d{2}-\d{2}$/
const spYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const br = (ymd: string) => ymd.split('-').reverse().join('/')

const cache = new Map<string, { at: number; value: string | null }>()

export async function getClosedUntil(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null
  const hit = cache.get(tenantId)
  if (hit && Date.now() - hit.at < 10_000) return hit.value
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  const value = row?.value && YMD.test(row.value) ? row.value : null
  cache.set(tenantId, { at: Date.now(), value })
  return value
}

/** Erro legível se alguma data cair no período fechado; senão null. */
export async function periodError(tenantId: string | null | undefined, dates: Array<Date | string | null | undefined>): Promise<string | null> {
  const closed = await getClosedUntil(tenantId)
  if (!closed) return null
  for (const d of dates) {
    if (!d) continue
    const ymd = typeof d === 'string' ? d.slice(0, 10) : spYmd(d)
    if (YMD.test(ymd) && ymd <= closed) return `Período fechado até ${br(closed)}. Lance o ajuste com data posterior.`
  }
  return null
}

/** Datas que travam um lançamento existente (baixa e competência). */
export function lockedDatesOf(e: { paidDate?: Date | null; competenceDate?: Date | null; status?: string }) {
  return [e.status === 'PAGO' || e.status === 'RECEBIDO' ? e.paidDate ?? null : null, e.competenceDate ?? null]
}

export async function setClosedUntil(tenantId: string, ymd: string | null, actor: { id: string; name?: string | null; role?: string | null }, reason?: string | null): Promise<string | null> {
  if (ymd && !YMD.test(ymd)) return 'Data inválida.'
  if (ymd && ymd >= spYmd(new Date())) return 'Só é possível fechar períodos que já terminaram.'
  const current = await getClosedUntil(tenantId)
  const reopening = !ymd || (current != null && ymd < current)
  if (reopening && !reason?.trim()) return 'Informe o motivo da reabertura.'
  if (ymd) {
    await prisma.systemSetting.upsert({
      where: { key: KEY(tenantId) },
      create: { tenantId, key: KEY(tenantId), value: ymd, group: 'finance', description: 'Financeiro fechado até', updatedByUserId: actor.id },
      update: { value: ymd, updatedByUserId: actor.id },
    })
  } else {
    await prisma.systemSetting.deleteMany({ where: { key: KEY(tenantId) } })
  }
  cache.delete(tenantId)
  await createSafeAuditLog({
    userId: actor.id, tenantId, action: reopening ? 'FINANCE_PERIOD_REOPEN' : 'FINANCE_PERIOD_CLOSE', entity: 'FinancePeriod', entityId: tenantId,
    userName: actor.name ?? null, userRole: actor.role ?? null, beforeData: { closedUntil: current }, afterData: { closedUntil: ymd, reason: reason?.trim() || null },
  })
  return null
}

export async function periodHistory(tenantId: string) {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId, entity: 'FinancePeriod', action: { in: ['FINANCE_PERIOD_CLOSE', 'FINANCE_PERIOD_REOPEN'] } },
    orderBy: { createdAt: 'desc' }, take: 30,
    select: { id: true, action: true, userName: true, createdAt: true, beforeData: true, afterData: true },
  })
  return rows.map((r) => ({
    id: r.id, kind: r.action === 'FINANCE_PERIOD_CLOSE' ? 'FECHOU' : 'REABRIU', userName: r.userName, at: r.createdAt,
    from: (r.beforeData as { closedUntil?: string | null } | null)?.closedUntil ?? null,
    to: (r.afterData as { closedUntil?: string | null } | null)?.closedUntil ?? null,
    reason: (r.afterData as { reason?: string | null } | null)?.reason ?? null,
  }))
}
