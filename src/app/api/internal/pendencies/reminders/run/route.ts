// =============================================================================
// /api/internal/pendencies/reminders/run — cron dos lembretes de pendência.
// Dispara push (FCM Android + Web Push iPhone/PWA) das pendências com lembrete
// automático vencidas. Protegido por CRON_SECRET (Authorization: Bearer <secret>
// ou x-cron-secret). Chamado pelo Vercel Cron (ver vercel.json) ou manualmente.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { sendDuePendencyReminders } from '@/lib/pendencies/reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const x = req.headers.get('x-cron-secret')
  return (!!auth && auth.startsWith('Bearer ') && auth.slice(7) === secret) || x === secret
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  try {
    const r = await sendDuePendencyReminders()
    return NextResponse.json({ success: true, ...r })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}

export const GET = run
export const POST = run
