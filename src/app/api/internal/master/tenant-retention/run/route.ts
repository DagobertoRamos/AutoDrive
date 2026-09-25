// =============================================================================
// GET|POST /api/internal/master/tenant-retention/run
// Cron (Vercel, 1x/dia): prazo de guarda de 5 anos das lojas desativadas —
// avisa o MASTER conforme a exclusão se aproxima e apaga as que venceram.
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { runRetentionSweep } from '@/lib/tenant-lifecycle/retention'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const result = await runRetentionSweep()
  return NextResponse.json({ success: result.errors.length === 0, ...result })
}

export const GET = handle
export const POST = handle
