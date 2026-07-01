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

function receivedSecret(req: NextRequest): string {
  const x = req.headers.get('x-cron-secret')
  if (x) return x
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : ''
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return receivedSecret(req) === secret
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    // Diagnóstico seguro (só com ?diag=1): NÃO revela os valores, só tamanhos.
    // Ajuda a achar espaço/quebra colado no segredo ou env fora de Production.
    if (new URL(req.url).searchParams.get('diag') === '1') {
      const env = process.env.CRON_SECRET ?? ''
      const got = receivedSecret(req)
      return NextResponse.json({ success: false, diag: { envSet: env.length > 0, envLen: env.length, gotLen: got.length, match: env.length > 0 && got === env } }, { status: 401 })
    }
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }
  try {
    const r = await sendDuePendencyReminders()
    return NextResponse.json({ success: true, ...r })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}

export const GET = run
export const POST = run
