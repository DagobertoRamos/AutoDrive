// =============================================================================
// /api/queue/jobs/sweep — UMA passada do "worker" da fila, via HTTP (para cron).
// Substitui o processo persistente (scripts/seller-queue-worker) no Vercel:
// um cron a cada 1 min chama este endpoint e ele roda, para TODAS as filas OPEN:
//   • sweepExpiredCalls — expira chamadas vencidas e AVANÇA o escalonamento;
//   • autoCheckoutStalePauses — tira da fila quem passou do tempo de pausa
//     (só se a unidade configurou maxPauseMinutes > 0).
// Protegido por QUEUE_JOB_SECRET ou CRON_SECRET (header x-cron-secret / Bearer).
// Aceita GET (Vercel Cron faz GET) e POST (serviços de cron externos). Sistema-
// wide (todos os tenants) — é um job, não uma requisição de usuário.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sweepExpiredCalls } from '@/lib/seller-queue/call'
import { autoCheckoutStalePauses } from '@/lib/seller-queue/automation'
import { getUnitConfig } from '@/lib/seller-queue/queue'

function authorized(req: Request): boolean {
  const header = req.headers.get('x-cron-secret') ?? ''
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const secrets = [process.env.QUEUE_JOB_SECRET, process.env.CRON_SECRET].filter(Boolean) as string[]
  if (!secrets.length) return false
  return secrets.includes(header) || secrets.includes(bearer)
}

async function runSweep() {
  const startedAt = Date.now()
  const queues = await prisma.sellerQueue.findMany({
    where: { status: 'OPEN' },
    select: { id: true, tenantId: true, unitId: true },
  }).catch(() => [] as Array<{ id: string; tenantId: string; unitId: string }>)

  let ok = 0
  let failed = 0
  for (const q of queues) {
    try {
      // Auto-checkout de pausas longas — respeita a config da unidade (só age se
      // maxPauseMinutes > 0; não força um padrão que a loja não escolheu).
      const cfg = await getUnitConfig(q.tenantId, q.unitId).catch(() => null)
      const maxPause = Number((cfg?.config as { maxPauseMinutes?: number } | null)?.maxPauseMinutes) || 0
      if (maxPause > 0) {
        await autoCheckoutStalePauses({ tenantId: q.tenantId, unitId: q.unitId, queueId: q.id, maxPauseMinutes: maxPause })
      }
      // Núcleo: expira chamadas vencidas e avança o escalonamento.
      await sweepExpiredCalls({ tenantId: q.tenantId, unitId: q.unitId, queueId: q.id, actorId: 'system-cron' })
      ok++
    } catch {
      failed++
    }
  }
  return { success: true, queues: queues.length, ok, failed, durationMs: Date.now() - startedAt }
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  return NextResponse.json(await runSweep())
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  return NextResponse.json(await runSweep())
}
