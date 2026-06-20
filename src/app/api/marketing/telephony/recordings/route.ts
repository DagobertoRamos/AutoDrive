// =============================================================================
// /api/marketing/telephony/recordings — gravações de chamadas (loja).
//   GET : marketing.telephony.recordings — lista gravações (SEM URL; só metadados).
// O acesso ao áudio é por /recordings/[id]/play (auditado). Tenant-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.recordings')) return forbiddenResponse('Sem acesso às gravações.')
  { const gate = await assertModuleEnabled(user, 'marketing.telephony.recordings'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
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
