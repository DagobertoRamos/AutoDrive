// =============================================================================
// GET|POST /api/internal/finance/recurrences/run
// Cron (Vercel, diário): gera os lançamentos previstos das receitas/despesas
// fixas de todas as lojas na janela rolante (hoje + 3 meses). Idempotente.
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { generateRecurrences } from '@/lib/finance/recurrence'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const result = await generateRecurrences()
  return NextResponse.json({ success: true, ...result })
}

export const GET = handle
export const POST = handle
