// =============================================================================
// /api/internal/marketing/telephony/recordings/archive-run — JOB de cron.
// Arquiva automaticamente as gravações ainda hospedadas no provedor (storageUrl
// http/https) no bucket próprio (storageUrl → s3://). Protegido por CRON_SECRET.
//
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// GET (Vercel Cron) e POST (disparo manual) — ambos exigem o segredo.
// Query opcional: ?limit=N (1..200, default 25). Configure CRON_SECRET no .env
// e na Vercel; agendado em vercel.json.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { archivePendingRecordings } from '@/lib/telephony/archive'

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[telephony/archive-run] CRON_SECRET não configurado — recusando.')
    return false
  }
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ') && auth.slice(7) === secret) return true
  if (req.headers.get('x-cron-secret') === secret) return true
  return false
}

async function handle(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  }
  const limitParam = Number(new URL(req.url).searchParams.get('limit'))
  const startedAt = Date.now()
  try {
    const report = await archivePendingRecordings({ limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined })
    return NextResponse.json({ success: true, durationMs: Date.now() - startedAt, ...report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[telephony/archive-run] erro:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
