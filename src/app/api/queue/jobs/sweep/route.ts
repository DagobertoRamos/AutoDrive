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
import { runQueueSweepAll } from '@/lib/seller-queue/sweep-job'

function authorized(req: Request): boolean {
  const header = req.headers.get('x-cron-secret') ?? ''
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const secrets = [process.env.QUEUE_JOB_SECRET, process.env.CRON_SECRET].filter(Boolean) as string[]
  if (!secrets.length) return false
  return secrets.includes(header) || secrets.includes(bearer)
}

async function runSweep() {
  const startedAt = Date.now()
  const r = await runQueueSweepAll()
  return { success: true, ...r, durationMs: Date.now() - startedAt }
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  return NextResponse.json(await runSweep())
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  return NextResponse.json(await runSweep())
}
