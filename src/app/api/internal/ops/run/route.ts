// =============================================================================
// GET|POST /api/internal/ops/run — job das operações veiculares (cron).
// Reprocessa eventos internos, consulta provedores das chamadas sem resposta,
// reconcilia estoque × RENAVE × fiscal e envia alertas (1 por assunto/dia).
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { runOpsJob } from '@/lib/automotive/jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const result = await runOpsJob()
  return NextResponse.json({ success: true, ...result })
}

export const GET = handle
export const POST = handle
