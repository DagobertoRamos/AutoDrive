// =============================================================================
// GET|POST /api/internal/storage/drive-migrate/run
// Cron (Vercel, a cada 6 h): leva p/ o Google Drive os arquivos que ainda estão
// no banco (antigos ou gravados no banco porque o Drive falhou na hora).
// Header: Authorization: Bearer <CRON_SECRET>  ou  x-cron-secret: <CRON_SECRET>
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { driveEnabled } from '@/lib/storage/drive'
import { migrateToDrive } from '@/lib/storage/drive-migrate'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!(await driveEnabled())) return NextResponse.json({ success: true, skipped: 'Google Drive não conectado.' })
  try {
    return NextResponse.json({ success: true, data: await migrateToDrive({ deadlineMs: 270_000 }) })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
