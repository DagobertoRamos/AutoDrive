import { NextResponse } from 'next/server'
import { processAttendanceReminders } from '@/lib/seller-queue/reminders'

function authorized(req: Request): boolean {
  const secret = process.env.QUEUE_JOB_SECRET
  if (!secret) return false
  const header = req.headers.get('x-cron-secret') ?? ''
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  return header === secret || bearer === secret
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
  const startedAt = Date.now()
  const body = await req.json().catch(() => ({})) as { tenantId?: string; unitId?: string }
  const data = await processAttendanceReminders({ tenantId: body.tenantId, unitId: body.unitId })
  return NextResponse.json({ ...data, durationMs: Date.now() - startedAt })
}
