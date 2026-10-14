// GET /api/master/drive/callback — retorno do Google após a autorização.
import { NextRequest, NextResponse } from 'next/server'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { requireMaster } from '@/lib/master-guards'
import { finishDriveConnect, testDrive, verifyDriveState, DRIVE_CALLBACK_PATH } from '@/lib/storage/drive'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error
  const back = new URL('/master/drive', req.nextUrl.origin)
  const sp = req.nextUrl.searchParams
  try {
    if (sp.get('error')) throw new Error(sp.get('error') === 'access_denied' ? 'Autorização cancelada no Google.' : `Google: ${sp.get('error')}`)
    if (!verifyDriveState(sp.get('state') ?? '', session.id)) throw new Error('Link de autorização expirado. Tente conectar de novo.')
    const code = sp.get('code')
    if (!code) throw new Error('O Google não devolveu o código de autorização.')
    const { account } = await finishDriveConnect(`${req.nextUrl.origin}${DRIVE_CALLBACK_PATH}`, code)
    await testDrive()
    await createSafeAuditLog({ userId: session.id, tenantId: null, action: 'CONNECT', entity: 'DriveSettings', entityId: 'drive', userName: session.name, userRole: 'MASTER', afterData: { account } })
    back.searchParams.set('ok', '1')
  } catch (e) {
    back.searchParams.set('erro', (e instanceof Error ? e.message : 'Falha ao conectar.').slice(0, 300))
  }
  return NextResponse.redirect(back)
}
