import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const { taskId } = await params
    const task = await prisma.marketingLeadTask.findFirst({
      where: { id: taskId, tenantId },
      include: {
        lead: { select: { id: true, assignedToUserId: true, unitId: true } },
      },
    })
    if (!task || !task.lead) return NextResponse.json({ success: false, error: 'Tarefa não encontrada.' }, { status: 404 })

    const scope = await resolveCrmScope(user)
    if (!scope) return forbiddenResponse('Sem acesso aos leads do CRM.')
    if (!canAccessLeadByScope(scope, user, task.lead)) return forbiddenResponse('Sem acesso a esta tarefa.')

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const nextStatus = String(body.status ?? '').trim() || task.status
    const canEditUnit = await canAccessModuleForUser(user, 'crm.lead.edit.unit')
    const updateData: Record<string, unknown> = {
      ...(body.title !== undefined ? { title: String(body.title ?? '').trim() || task.title } : {}),
      ...(body.type !== undefined ? { type: String(body.type ?? '').trim() || task.type } : {}),
      ...(body.notes !== undefined ? { notes: String(body.notes ?? '').trim() || null } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(String(body.dueAt)) : null } : {}),
      ...(body.assignedToUserId !== undefined && canEditUnit
        ? { assignedToUserId: String(body.assignedToUserId ?? '').trim() || null }
        : {}),
      status: nextStatus,
      completedAt: nextStatus === 'DONE' ? new Date() : nextStatus === 'PENDING' ? null : task.completedAt,
    }

    const updated = await prisma.marketingLeadTask.update({ where: { id: taskId }, data: updateData })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE_TASK', entity: 'MarketingLeadTask', entityId: updated.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
