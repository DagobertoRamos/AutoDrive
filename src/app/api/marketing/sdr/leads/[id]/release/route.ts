// =============================================================================
// /api/marketing/sdr/leads/[id]/release — liberar/recusar um lead.
// POST : marketing.sdr (o responsável atual) OU marketing.leads.distribute (gestor).
// Devolve o lead para a fila/tanque (recycle) ou apenas remove o responsável.
// Registra motivo + auditoria (status REFUSED no histórico de assignment).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { releaseLeadSchema } from '@/lib/validators/marketing'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr')) return forbiddenResponse('Sem acesso à Mesa SDR.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const lead = await prisma.marketingLead.findUnique({ where: { id }, select: { id: true, tenantId: true, assignedToUserId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, lead.tenantId)) return forbiddenResponse('Lead de outro tenant.')

    // Apenas o responsável atual ou um gestor (distribuição) pode liberar.
    const isManager = canAccessModule(user.role, 'marketing.leads.distribute')
    if (lead.assignedToUserId !== user.id && !isManager) {
      return forbiddenResponse('Apenas o responsável atual ou a gestão pode liberar este lead.')
    }

    const d = releaseLeadSchema.parse(await req.json().catch(() => ({})))
    await prisma.$transaction(async (tx) => {
      await tx.marketingLead.update({
        where: { id },
        data: { assignedToUserId: null, claimedByUserId: null, claimedAt: null, status: d.recycle ? 'RECYCLED' : 'NEW' },
      })
      await tx.marketingLeadAssignment.create({
        data: { tenantId: tid, leadId: id, assignedToUserId: lead.assignedToUserId, assignedByUserId: user.id, mode: 'MANUAL', status: 'REFUSED', reason: d.reason ?? null, respondedAt: new Date() },
      })
    })
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'RELEASE', entity: 'MarketingLead', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
