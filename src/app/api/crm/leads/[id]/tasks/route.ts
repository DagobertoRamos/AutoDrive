import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const { id } = await params
    const scope = await resolveCrmScope(user)
    if (!scope) return forbiddenResponse('Sem acesso aos leads do CRM.')
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    if (!canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const rows = await prisma.marketingLeadTask.findMany({
      where: { tenantId, leadId: id },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    })
    const userIds = [...new Set(rows.map((item) => item.assignedToUserId).filter(Boolean) as string[])]
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : []
    const userNames = new Map(users.map((item) => [item.id, item.name]))

    return NextResponse.json({
      success: true,
      data: rows.map((item) => ({
        ...item,
        assignedToUserName: item.assignedToUserId ? userNames.get(item.assignedToUserId) ?? null : null,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const { id } = await params
    const scope = await resolveCrmScope(user)
    if (!scope) return forbiddenResponse('Sem acesso aos leads do CRM.')
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    if (!canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ success: false, error: 'Informe o título da tarefa.' }, { status: 400 })

    const requestedAssignee = String(body.assignedToUserId ?? '').trim() || null
    const canEditUnit = await canAccessModuleForUser(user, 'crm.lead.edit.unit')
    const assignedToUserId = canEditUnit ? requestedAssignee ?? lead.assignedToUserId ?? user.id : (lead.assignedToUserId ?? user.id)

    const task = await prisma.marketingLeadTask.create({
      data: {
        tenantId,
        leadId: id,
        assignmentId: null,
        cadenceId: null,
        assignedToUserId,
        type: String(body.type ?? 'FOLLOW_UP').trim() || 'FOLLOW_UP',
        title,
        status: 'PENDING',
        dueAt: body.dueAt ? new Date(String(body.dueAt)) : null,
        notes: String(body.notes ?? '').trim() || null,
        createdById: user.id,
      },
    })

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE_TASK', entity: 'MarketingLeadTask', entityId: task.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: task }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
