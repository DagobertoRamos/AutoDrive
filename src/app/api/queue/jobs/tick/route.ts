// =============================================================================
// /api/queue/jobs/tick — CRON ÚNICO: roda todos os jobs periódicos numa chamada.
//   • Fila: sweep (escalonamento/timeout + auto-checkout de pausas)
//   • Fila: lembretes de atendimento aberto
//   • Pendências: lembretes vencidos
//   • Pendências: auto-arquivar resolvidas
//   • Comunicação: avisos agendados (dispara os que chegaram na hora)
// Cada job é isolado (um erro não derruba os outros). Protegido por
// QUEUE_JOB_SECRET ou CRON_SECRET (header x-cron-secret / Bearer). GET+POST.
// Aponte UM cron (cron-job.org) a cada 1 min para este endpoint.
// =============================================================================

import { NextResponse } from 'next/server'
import { runQueueSweepAll } from '@/lib/seller-queue/sweep-job'
import { processAttendanceReminders } from '@/lib/seller-queue/reminders'
import { runQueueComplianceSweep } from '@/lib/seller-queue/compliance'
import { runPenaltyExpirySweep } from '@/lib/seller-queue/penalty-expiry'
import { sendDuePendencyReminders } from '@/lib/pendencies/reminders'
import { runPendencyNaggingSweep } from '@/lib/pendencies/nagging-sweep'
import { archiveResolvedPendenciesJob } from '@/lib/pendencies/auto-archive'
import { dispatchScheduledAvisos } from '@/lib/comunicacao/scheduled-avisos'
import { runQualityAutoSweep } from '@/lib/quality/auto-sweep'

function authorized(req: Request): boolean {
  const header = req.headers.get('x-cron-secret') ?? ''
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const secrets = [process.env.QUEUE_JOB_SECRET, process.env.CRON_SECRET].filter(Boolean) as string[]
  if (!secrets.length) return false
  return secrets.includes(header) || secrets.includes(bearer)
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<{ ok: boolean; label: string; data?: T; error?: string }> {
  try { return { ok: true, label, data: await fn() } }
  catch (e) { return { ok: false, label, error: e instanceof Error ? e.message : String(e) } }
}

async function tick() {
  const startedAt = Date.now()
  // Sequencial (não paralelo) para não sobrecarregar o Neon numa function só.
  const jobs = [
    await safe('queueSweep', () => runQueueSweepAll()),
    await safe('queueReminders', () => processAttendanceReminders({})),
    await safe('queueCompliance', () => runQueueComplianceSweep()),
    await safe('penaltyExpiry', () => runPenaltyExpirySweep()),
    await safe('pendencyReminders', () => sendDuePendencyReminders()),
    await safe('pendencyNagging', () => runPendencyNaggingSweep()),
    await safe('pendencyAutoArchive', () => archiveResolvedPendenciesJob()),
    await safe('scheduledAvisos', () => dispatchScheduledAvisos()),
    await safe('qualityAutoSweep', () => runQualityAutoSweep()),
  ]
  return { success: true, durationMs: Date.now() - startedAt, jobs }
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  return NextResponse.json(await tick())
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  return NextResponse.json(await tick())
}
