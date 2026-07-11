// =============================================================================
// POST /api/crm/leads/[id]/delete — SOFT DELETE com auditoria e motivo.
// Gate: crm.lead.delete (gerente+). Preserva histórico, atividades, negociação.
// Lead com negociação ativa é arquivado, não excluído.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.lead.delete')) return forbiddenResponse('Sem permissão para excluir leads.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const lead = await prisma.marketingLead.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, assignedToUserId: true, unitId: true, convertedDealId: true, name: true, leadNumber: true },
    })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })

    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const { reason } = await req.json().catch(() => ({})) as { reason?: string }
    if (!reason?.trim() || reason.trim().length < 5) {
      return NextResponse.json({ success: false, error: 'Informe o motivo da exclusão (mín. 5 caracteres).' }, { status: 400 })
    }

    await prisma.marketingLead.update({
      where: { id },
      data: { deletedAt: new Date(), deletedByUserId: user.id, deleteReason: reason.trim() },
    })

    await createSafeAuditLog({
      userId: user.id, tenantId, action: 'DELETE', entity: 'MarketingLead', entityId: id,
      userName: user.name, userRole: user.role,
      afterData: { reason: reason.trim(), hadDeal: !!lead.convertedDealId },
    })

    return NextResponse.json({ success: true, data: { id, softDeleted: true } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
