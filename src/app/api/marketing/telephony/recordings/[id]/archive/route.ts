// =============================================================================
// POST /api/marketing/telephony/recordings/[id]/archive — baixa a gravação do
// provedor e arquiva no bucket próprio (storageUrl passa a `s3://…`).
// Gate: marketing.telephony.manage. Tenant-scoped, auditado. Idempotente
// (se já arquivada, retorna already_archived). Pensado p/ uso manual ou por job.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'
import { archiveRecording } from '@/lib/telephony/archive'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.manage')) return forbiddenResponse('Sem permissão para arquivar gravações.')
  { const gate = await assertModuleEnabled(user, 'marketing.telephony.manage'); if (gate) return gate }
  const { id } = await params
  try {
    const rec = await prisma.telephonyRecording.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!rec) return NextResponse.json({ success: false, error: 'Gravação não encontrada.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, rec.tenantId)) return forbiddenResponse('Gravação de outro tenant.')

    const result = await archiveRecording(id, user.id)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message, status: result.status }, { status: 400 })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return handlePrismaError(err)
  }
}
