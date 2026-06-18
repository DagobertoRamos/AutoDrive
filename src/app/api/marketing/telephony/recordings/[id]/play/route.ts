// =============================================================================
// /api/marketing/telephony/recordings/[id]/play — acesso controlado à gravação.
// GET : marketing.telephony.recordings.
//
// Acesso a gravação é sensível (LGPD): só libera se status = AVAILABLE; bloqueia
// DELETED/EXPIRED/BLOCKED/PENDING. TODO acesso é AUDITADO (AuditLog action
// RECORDING_ACCESS + TelephonyIntegrationLog) — quem ouviu, quando, qual.
// A URL é protegida (nunca pública/em log). Storage real entra na Fase 4.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.recordings')) return forbiddenResponse('Sem acesso às gravações.')
  const { id } = await params
  try {
    const rec = await prisma.telephonyRecording.findUnique({ where: { id } })
    if (!rec) return NextResponse.json({ success: false, error: 'Gravação não encontrada.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, rec.tenantId)) return forbiddenResponse('Gravação de outro tenant.')

    if (rec.status !== 'AVAILABLE' || !rec.storageUrl) {
      // Auditoria também de tentativa negada.
      await prisma.telephonyIntegrationLog.create({
        data: { tenantId: rec.tenantId, action: 'RECORDING_ACCESS', status: 'BLOCKED', message: `negado (status=${rec.status})`, createdByUserId: user.id },
      }).catch(() => {})
      const msg = rec.status === 'DELETED' ? 'Gravação excluída.'
        : rec.status === 'EXPIRED' ? 'Gravação expirada pela política de retenção.'
        : rec.status === 'BLOCKED' ? 'Gravação bloqueada.'
        : 'Gravação ainda não disponível.'
      return NextResponse.json({ success: false, error: msg }, { status: 409 })
    }

    // Acesso concedido — auditoria obrigatória (quem ouviu).
    await prisma.telephonyIntegrationLog.create({
      data: { tenantId: rec.tenantId, action: 'RECORDING_ACCESS', status: 'OK', message: `acesso concedido (call ${rec.callId})`, createdByUserId: user.id },
    }).catch(() => {})
    await createSafeAuditLog({ userId: user.id, tenantId: rec.tenantId, action: 'RECORDING_ACCESS', entity: 'TelephonyRecording', entityId: id, userName: user.name, userRole: user.role })

    return NextResponse.json({ success: true, data: { url: rec.storageUrl, mimeType: rec.mimeType, durationSec: rec.durationSec } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
