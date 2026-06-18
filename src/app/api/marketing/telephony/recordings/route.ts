// =============================================================================
// /api/marketing/telephony/recordings — gravações de chamadas (loja).
//   GET : marketing.telephony.recordings — lista gravações (SEM URL; só metadados).
// O acesso ao áudio é por /recordings/[id]/play (auditado). Tenant-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.recordings')) return forbiddenResponse('Sem acesso às gravações.')
  const tid = user.tenantId
  if (!tid) return forbiddenResponse('A telefonia pertence à loja.')
  try {
    const rows = await prisma.telephonyRecording.findMany({
      where: { tenantId: tid },
      orderBy: [{ createdAt: 'desc' }], take: 500,
      select: { id: true, callId: true, status: true, fileName: true, mimeType: true, durationSec: true, sizeBytes: true, retentionUntil: true, deletedAt: true, createdAt: true },
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}
