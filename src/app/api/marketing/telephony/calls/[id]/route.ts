// =============================================================================
// /api/marketing/telephony/calls/[id] — detalhe da chamada (+ eventos).
// GET : marketing.telephony. Tenant-scoped. NÃO retorna URL de gravação aqui
// (acesso à gravação é por /recordings/[id]/play, com auditoria).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony')) return forbiddenResponse('Sem acesso à telefonia.')
  { const gate = await assertModuleEnabled(user, 'marketing.telephony'); if (gate) return gate }
  const { id } = await params
  try {
    const call = await prisma.telephonyCall.findUnique({
      where: { id },
      include: {
        events: { orderBy: { occurredAt: 'asc' }, take: 200 },
        recording: { select: { id: true, status: true, durationSec: true, retentionUntil: true } },
      },
    })
    if (!call) return NextResponse.json({ success: false, error: 'Chamada não encontrada.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, call.tenantId)) return forbiddenResponse('Chamada de outro tenant.')
    return NextResponse.json({ success: true, data: call })
  } catch (err) {
    return handlePrismaError(err)
  }
}
