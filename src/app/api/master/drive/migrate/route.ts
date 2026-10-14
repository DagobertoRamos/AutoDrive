// POST /api/master/drive/migrate — leva um lote de arquivos antigos do banco p/ o Drive.
import { NextResponse } from 'next/server'
import { requireMaster } from '@/lib/master-guards'
import { migrateToDrive } from '@/lib/storage/drive-migrate'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const { error } = await requireMaster()
  if (error) return error
  try {
    return NextResponse.json({ success: true, data: await migrateToDrive({ deadlineMs: 240_000 }) })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Falha na migração.' }, { status: 502 })
  }
}
