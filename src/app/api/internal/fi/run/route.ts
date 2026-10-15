// =============================================================================
// GET|POST /api/internal/fi/run — rotina do F&I (cron a cada 6 h): propostas
// sem resposta, aprovações vencidas e retenção de documentos.
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runFiJobs } from '@/lib/finance/fi/jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const same = (v: string | null) => { if (!v) return false; const a = Buffer.from(v); const b = Buffer.from(secret); return a.length === b.length && timingSafeEqual(a, b) }
  return same(req.headers.get('authorization')?.replace(/^Bearer /, '') ?? null) || same(req.headers.get('x-cron-secret'))
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const result = await runFiJobs()
  return NextResponse.json({ success: true, ...result })
}

export const GET = handle
export const POST = handle
