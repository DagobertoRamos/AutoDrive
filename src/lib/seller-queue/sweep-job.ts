// =============================================================================
// seller-queue/sweep-job.ts — UMA passada do "worker" da fila (reutilizável por
// /api/queue/jobs/sweep e pelo /tick unificado). Para todas as filas OPEN:
//   • sweepExpiredCalls — expira chamadas vencidas e AVANÇA o escalonamento;
//   • autoCheckoutStalePauses — só se a unidade configurou maxPauseMinutes > 0.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { sweepExpiredCalls } from '@/lib/seller-queue/call'
import { autoCheckoutStalePauses } from '@/lib/seller-queue/automation'
import { getUnitConfig } from '@/lib/seller-queue/queue'

export async function runQueueSweepAll(): Promise<{ queues: number; ok: number; failed: number }> {
  const queues = await prisma.sellerQueue.findMany({
    where: { status: 'OPEN' },
    select: { id: true, tenantId: true, unitId: true },
  }).catch(() => [] as Array<{ id: string; tenantId: string; unitId: string }>)

  let ok = 0
  let failed = 0
  for (const q of queues) {
    try {
      const cfg = await getUnitConfig(q.tenantId, q.unitId).catch(() => null)
      const maxPause = Number((cfg?.config as { maxPauseMinutes?: number } | null)?.maxPauseMinutes) || 0
      if (maxPause > 0) await autoCheckoutStalePauses({ tenantId: q.tenantId, unitId: q.unitId, queueId: q.id, maxPauseMinutes: maxPause })
      await sweepExpiredCalls({ tenantId: q.tenantId, unitId: q.unitId, queueId: q.id, actorId: 'system-cron' })
      ok++
    } catch {
      failed++
    }
  }
  return { queues: queues.length, ok, failed }
}
