import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { resolveCrmScope } from '@/lib/crm/shared'

const UPDATABLE_STATUSES = new Set(['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'CONVERTED', 'LOST', 'DISCARDED', 'RECYCLED'])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const { id } = await params
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })

    const scope = await resolveCrmScope(user)
    if (!scope) return forbiddenResponse('Sem acesso aos leads do CRM.')
    if (scope === 'own' && lead.assignedToUserId !== user.id) return forbiddenResponse('Você só pode editar seus próprios leads.')
    if (scope === 'unit' && lead.unitId !== user.unitId) return forbiddenResponse('Você só pode editar leads da sua unidade.')

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const canEditUnit = await canAccessModuleForUser(user, 'crm.lead.edit.unit')
    const canTransfer = await canAccessModuleForUser(user, 'crm.lead.transfer')
    const canMarkLost = await canAccessModuleForUser(user, 'crm.lead.mark_lost')
    const canConvert = await canAccessModuleForUser(user, 'crm.lead.convert')
    const nextStatus = body.status ? String(body.status) : null

    if (nextStatus === 'LOST' && !canMarkLost) return forbiddenResponse('Sem permissão para marcar lead como perdido.')
    if (nextStatus === 'CONVERTED' && !canConvert) return forbiddenResponse('Sem permissão para converter lead.')
    if (nextStatus && !UPDATABLE_STATUSES.has(nextStatus)) {
      return NextResponse.json({ success: false, error: 'Status de lead inválido.' }, { status: 400 })
    }
    if (nextStatus === 'LOST' && !String(body.lostReason ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'Informe o motivo da perda.' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      ...(body.name !== undefined ? { name: String(body.name || '').trim() || null } : {}),
      ...(body.phone !== undefined ? { phone: String(body.phone || '').trim() || null } : {}),
      ...(body.email !== undefined ? { email: String(body.email || '').trim() || null } : {}),
      ...(body.source !== undefined ? { source: String(body.source || '').trim() || null } : {}),
      ...(body.notes !== undefined ? { notes: String(body.notes || '').trim() || null } : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(body.lostReason !== undefined ? { lostReason: String(body.lostReason || '').trim() || null } : {}),
      lastContactAt: body.registerContact ? new Date() : lead.lastContactAt,
    }

    if (body.assignedToUserId !== undefined) {
      const assignedToUserId = String(body.assignedToUserId || '').trim() || null
      if (!canTransfer && assignedToUserId !== user.id) return forbiddenResponse('Sem permissão para transferir lead.')
      updateData.assignedToUserId = assignedToUserId
    }
    if (body.unitId !== undefined && canEditUnit) {
      updateData.unitId = String(body.unitId || '').trim() || null
    }
    if (nextStatus === 'CONVERTED' && body.convertedDealId) {
      updateData.convertedDealId = String(body.convertedDealId)
      updateData.convertedAt = new Date()
    }

    const updated = await prisma.marketingLead.update({ where: { id }, data: updateData })
    if (body.assignedToUserId !== undefined || nextStatus) {
      await prisma.marketingLeadAssignment.create({
        data: {
          tenantId,
          leadId: updated.id,
          assignedToUserId: updated.assignedToUserId,
          assignedByUserId: user.id,
          mode: 'MANUAL',
          status: nextStatus === 'CONVERTED' ? 'CONVERTED' : nextStatus === 'LOST' ? 'REFUSED' : 'ASSIGNED',
          reason: nextStatus === 'LOST' ? String(body.lostReason || '').trim() || null : String(body.reason || '').trim() || null,
        },
      }).catch(() => {})
    }
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'MarketingLead', entityId: updated.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
