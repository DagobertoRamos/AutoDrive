// =============================================================================
// /api/marketing/sdr/leads/[id]/assign — atribuição MANUAL (Livre) de um lead.
// POST : marketing.leads.distribute. Gestor/SDR líder escolhe o responsável.
// Valida que o responsável pertence ao tenant. Registra motivo + auditoria.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { assignLeadSchema } from '@/lib/validators/marketing'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.leads.distribute')) return forbiddenResponse('Sem permissão para distribuir leads.')
  const tid = user.tenantId
  if (!tid) return forbiddenResponse('A Mesa SDR pertence à loja.')
  const { id } = await params
  try {
    const lead = await prisma.marketingLead.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, lead.tenantId)) return forbiddenResponse('Lead de outro tenant.')

    const d = assignLeadSchema.parse(await req.json())
    // Responsável precisa pertencer ao tenant.
    const target = await prisma.user.findFirst({ where: { id: d.assignedToUserId, tenantId: tid }, select: { id: true } })
    if (!target) return NextResponse.json({ success: false, error: 'Responsável inválido para esta loja.' }, { status: 400 })

    await prisma.$transaction(async (tx) => {
      await tx.marketingLead.update({
        where: { id },
        data: { assignedToUserId: d.assignedToUserId, claimedByUserId: d.assignedToUserId, claimedAt: new Date(), status: 'ASSIGNED' },
      })
      await tx.marketingLeadAssignment.create({
        data: { tenantId: tid, leadId: id, assignedToUserId: d.assignedToUserId, assignedByUserId: user.id, mode: 'MANUAL', status: 'ASSIGNED', reason: d.reason ?? null },
      })
    })
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'ASSIGN', entity: 'MarketingLead', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
