// GET /api/master/drive/connect — leva o MASTER para a tela de autorização do Google.
import { NextRequest, NextResponse } from 'next/server'
import { requireMaster } from '@/lib/master-guards'
import { driveAuthUrl, signDriveState, DRIVE_CALLBACK_PATH } from '@/lib/storage/drive'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const url = await driveAuthUrl(`${req.nextUrl.origin}${DRIVE_CALLBACK_PATH}`, signDriveState(session.id))
    return NextResponse.redirect(url)
  } catch (e) {
    const back = new URL('/master/drive', req.nextUrl.origin)
    back.searchParams.set('erro', e instanceof Error ? e.message : 'Falha ao conectar.')
    return NextResponse.redirect(back)
  }
}
