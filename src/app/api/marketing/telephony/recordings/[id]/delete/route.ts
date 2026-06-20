// =============================================================================
// /api/marketing/telephony/recordings/[id]/delete — exclusão (LGPD) da gravação.
// POST : marketing.telephony.manage.
//
// Soft-delete: marca status=DELETED, deletedAt/deletedByUserId e limpa storageUrl
// (a remoção física no provedor/storage entra na Fase 4). Auditado. Permite
// cumprir política de retenção / direito de exclusão do titular.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.manage')) return forbiddenResponse('Sem permissão para excluir gravações.')
  { const gate = await assertModuleEnabled(user, 'marketing.telephony.manage'); if (gate) return gate }
  const { id } = await params
  try {
    const rec = await prisma.telephonyRecording.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true, callId: true } })
    if (!rec) return NextResponse.json({ success: false, error: 'Gravação não encontrada.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, rec.tenantId)) return forbiddenResponse('Gravação de outro tenant.')
    if (rec.status === 'DELETED') return NextResponse.json({ success: true, alreadyDeleted: true })

    await prisma.$transaction([
      prisma.telephonyRecording.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: user.id, storageUrl: null } }),
      prisma.telephonyIntegrationLog.create({ data: { tenantId: rec.tenantId, action: 'RECORDING_DELETE', status: 'OK', message: `gravação excluída (call ${rec.callId})`, createdByUserId: user.id } }),
    ])
    await createSafeAuditLog({ userId: user.id, tenantId: rec.tenantId, action: 'DELETE', entity: 'TelephonyRecording', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
