// =============================================================================
// GET|POST /api/internal/publications/run — processa a fila de publicações.
// Cron da Vercel (a cada minuto) + ?reconcile=1 (a cada 15 min): conferência
// com os canais, venda × anúncios e sincronização de conteúdo.
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { runWorker } from '@/lib/publications/worker'
import { reconcile } from '@/lib/publications/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const doReconcile = req.nextUrl.searchParams.get('reconcile') === '1'
  const rec = doReconcile ? await reconcile() : null
  const work = await runWorker({ maxJobs: 60, deadlineMs: 240_000 })
  return NextResponse.json({ success: true, reconcile: rec, recovered: work.recovered, processed: work.processed.length, results: work.processed.map((p) => ({ op: p.op, channel: p.channel, result: p.result })) })
}

export const GET = handle
export const POST = handle
