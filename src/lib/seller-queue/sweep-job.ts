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
import { reinforceQueueCallPush } from '@/lib/push/queue-push'

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
      // Reforço server-side do "fica tocando" (iPhone/PWA): reenvia o push de
      // toda chamada CALLED ainda PENDENTE (após o sweep já ter expirado as
      // vencidas). Independe do after()/cliente — cobre app fechado/bloqueado.
      const now = new Date()
      const pending = await prisma.sellerQueueAttendance.findMany({
        where: { queueId: q.id, status: 'CALLED', acceptDeadline: { gt: now } },
        select: { id: true, sellerId: true, acceptDeadline: true, arrival: { select: { customerName: true } } },
      })
      for (const att of pending) {
        const secondsLeft = Math.max(5, Math.round(((att.acceptDeadline as Date).getTime() - now.getTime()) / 1000))
        await reinforceQueueCallPush(att.sellerId, att.id, att.arrival?.customerName ?? null, secondsLeft).catch(() => {})
      }
      ok++
    } catch {
      failed++
    }
  }
  return { queues: queues.length, ok, failed }
}
