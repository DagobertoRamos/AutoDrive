// POST /api/master/drive/test — confere a conexão (garante a pasta AutoDrive).
import { NextResponse } from 'next/server'
import { requireMaster } from '@/lib/master-guards'
import { testDrive } from '@/lib/storage/drive'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { error } = await requireMaster()
  if (error) return error
  try {
    return NextResponse.json({ success: true, data: await testDrive() })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Falha no teste.' }, { status: 502 })
  }
}
