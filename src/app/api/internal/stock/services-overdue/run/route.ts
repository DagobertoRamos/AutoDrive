// =============================================================================
// GET|POST /api/internal/stock/services-overdue/run
// Cron (Vercel, de hora em hora): serviços de preparação em andamento com a
// previsão de entrega vencida → avisa a preparação e os gestores (1x por prazo).
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { notifyOverdueServices } from '@/lib/stock/vehicle-services'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const notified = await notifyOverdueServices()
  return NextResponse.json({ success: true, notified })
}

export const GET = handle
export const POST = handle
