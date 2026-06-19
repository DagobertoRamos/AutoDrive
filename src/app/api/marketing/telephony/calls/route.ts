// =============================================================================
// /api/marketing/telephony/calls — histórico de chamadas (loja).
//   GET : marketing.telephony — lista chamadas do tenant
//         (filtros ?direction= &status= &leadId= &numberId=).
// Tenant-scoped. Chamadas são populadas por webhooks/adapters (Fase 4).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import type { CallDirection, CallStatus, Prisma } from '@prisma/client'

const DIRECTIONS: CallDirection[] = ['INBOUND', 'OUTBOUND', 'INTERNAL']
const STATUSES: CallStatus[] = ['RINGING', 'ANSWERED', 'MISSED', 'BUSY', 'FAILED', 'COMPLETED', 'VOICEMAIL', 'CANCELED']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony')) return forbiddenResponse('Sem acesso à telefonia.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const where: Prisma.TelephonyCallWhereInput = { tenantId: tid }
  const dir = sp.get('direction'); const st = sp.get('status')
  const leadId = sp.get('leadId'); const numberId = sp.get('numberId')
  if (dir && (DIRECTIONS as string[]).includes(dir)) where.direction = dir as CallDirection
  if (st && (STATUSES as string[]).includes(st)) where.status = st as CallStatus
  if (leadId) where.leadId = leadId
  if (numberId) where.numberId = numberId
  try {
    const rows = await prisma.telephonyCall.findMany({
      where, orderBy: [{ createdAt: 'desc' }], take: 500,
      include: { recording: { select: { id: true, status: true } } },
    })
    return NextResponse.json({
      success: true,
      data: rows.map((c) => ({
        id: c.id, direction: c.direction, status: c.status, fromNumber: c.fromNumber, toNumber: c.toNumber,
        agentUserId: c.agentUserId, leadId: c.leadId, source: c.source, startedAt: c.startedAt,
        answeredAt: c.answeredAt, endedAt: c.endedAt, durationSec: c.durationSec,
        hasRecording: !!c.recording, recordingStatus: c.recording?.status ?? null, createdAt: c.createdAt,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
