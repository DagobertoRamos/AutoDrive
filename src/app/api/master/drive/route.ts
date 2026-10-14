// =============================================================================
// /api/master/drive — Google Drive da plataforma (MASTER only)
// GET    — status da conexão + arquivos que ainda estão no banco
// POST   — salva Client ID / Client secret do OAuth (secret criptografado)
// DELETE — desconecta a conta (os arquivos continuam no Drive)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { requireMaster } from '@/lib/master-guards'
import { disconnectDrive, driveStatus, saveDriveClient, DRIVE_CALLBACK_PATH } from '@/lib/storage/drive'
import { drivePending } from '@/lib/storage/drive-migrate'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { error } = await requireMaster()
  if (error) return error
  const [status, pending] = await Promise.all([driveStatus(), drivePending().catch(() => null)])
  return NextResponse.json({ success: true, data: { ...status, pending, redirectUri: `${req.nextUrl.origin}${DRIVE_CALLBACK_PATH}` } })
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error
  const body = await req.json().catch(() => ({})) as { clientId?: string; clientSecret?: string }
  const clientId = String(body.clientId ?? '').trim()
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    return NextResponse.json({ success: false, error: 'Client ID inválido (termina em .apps.googleusercontent.com).' }, { status: 400 })
  }
  const secret = String(body.clientSecret ?? '').trim()
  const current = await driveStatus()
  if (!secret && !current.clientConfigured) return NextResponse.json({ success: false, error: 'Informe o Client secret.' }, { status: 400 })
  await saveDriveClient(clientId, secret || null)
  await createSafeAuditLog({ userId: session.id, tenantId: null, action: 'UPDATE', entity: 'DriveSettings', entityId: 'drive', userName: session.name, userRole: 'MASTER', afterData: { clientId, secretChanged: !!secret } })
  return NextResponse.json({ success: true, data: await driveStatus() })
}

export async function DELETE() {
  const { session, error } = await requireMaster()
  if (error) return error
  await disconnectDrive()
  await createSafeAuditLog({ userId: session.id, tenantId: null, action: 'DELETE', entity: 'DriveSettings', entityId: 'drive', userName: session.name, userRole: 'MASTER' })
  return NextResponse.json({ success: true, data: await driveStatus() })
}
