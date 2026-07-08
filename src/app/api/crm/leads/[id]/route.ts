import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

const UPDATABLE_STATUSES = new Set(['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'CONVERTED', 'LOST', 'DISCARDED', 'RECYCLED'])

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

    const lead = await prisma.marketingLead.findFirst({
      where: { id, tenantId },
      include: {
        assignments: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            assignedToUserId: true,
            assignedByUserId: true,
            mode: true,
            status: true,
            reason: true,
            respondedAt: true,
            createdAt: true,
          },
        },
        claims: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, userId: true, action: true, succeeded: true, createdAt: true },
        },
        slas: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, slaSeconds: true, deadline: true, status: true, breachedAt: true, createdAt: true },
        },
        tasks: {
          orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
          take: 50,
          select: {
            id: true,
            assignedToUserId: true,
            type: true,
            title: true,
            status: true,
            dueAt: true,
            completedAt: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    if (!canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const userIds = [...new Set([
      lead.assignedToUserId,
      lead.createdById,
      ...lead.assignments.flatMap((item) => [item.assignedToUserId, item.assignedByUserId]),
      ...lead.claims.map((item) => item.userId),
      ...lead.tasks.map((item) => item.assignedToUserId),
    ].filter(Boolean) as string[])]

    const [users, unit, customer, vehicle, deal, attendance] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      lead.unitId ? prisma.unit.findFirst({ where: { id: lead.unitId, tenantId }, select: { id: true, name: true } }) : Promise.resolve(null),
      lead.customerId ? prisma.customer.findFirst({ where: { id: lead.customerId, tenantId }, select: { id: true, name: true, phone: true, email: true } }) : Promise.resolve(null),
      lead.vehicleId ? prisma.vehicle.findFirst({ where: { id: lead.vehicleId, tenantId }, select: { id: true, plate: true, brand: true, model: true, modelYear: true } }) : Promise.resolve(null),
      lead.convertedDealId ? prisma.deal.findFirst({ where: { id: lead.convertedDealId, tenantId }, select: { id: true, dealNumber: true, status: true, type: true, createdAt: true } }) : Promise.resolve(null),
      prisma.sellerQueueAttendance.findFirst({
        where: { tenantId, leadId: lead.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, sellerId: true, status: true, result: true, calledAt: true, finishedAt: true, dealId: true },
      }),
    ])

    const userNames = new Map(users.map((item) => [item.id, item.name]))

    const [attendances, calls] = await Promise.all([
      prisma.sellerQueueAttendance.findMany({
        where: { tenantId, leadId: lead.id },
        orderBy: { calledAt: 'desc' },
        take: 20,
        select: {
          id: true,
          sellerId: true,
          status: true,
          result: true,
          type: true,
          visitType: true,
          calledAt: true,
          acceptedAt: true,
          finishedAt: true,
          dealId: true,
        },
      }),
      prisma.telephonyCall.findMany({
        where: {
          tenantId,
          OR: [
            { leadId: lead.id },
            ...(lead.customerId ? [{ customerId: lead.customerId }] : []),
          ],
        },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        select: {
          id: true,
          direction: true,
          status: true,
          fromNumber: true,
          toNumber: true,
          agentUserId: true,
          source: true,
          startedAt: true,
          answeredAt: true,
          endedAt: true,
          durationSec: true,
          createdAt: true,
          recording: { select: { id: true, status: true } },
        },
      }),
    ])

    for (const sellerId of attendances.map((item) => item.sellerId)) {
      if (sellerId && !userNames.has(sellerId)) {
        const seller = await prisma.user.findFirst({ where: { id: sellerId }, select: { id: true, name: true } })
        if (seller) userNames.set(seller.id, seller.name)
      }
    }
    for (const agentUserId of calls.map((item) => item.agentUserId).filter(Boolean) as string[]) {
      if (!userNames.has(agentUserId)) {
        const agent = await prisma.user.findFirst({ where: { id: agentUserId }, select: { id: true, name: true } })
        if (agent) userNames.set(agent.id, agent.name)
      }
    }

    const timeline = [
      ...calls.map((item) => ({
        id: `call-${item.id}`,
        at: item.startedAt ?? item.createdAt,
        type: 'CALL',
        title: `Chamada ${String(item.direction).toLowerCase()} ${String(item.status).toLowerCase()}`,
        detail: `${item.fromNumber ?? 'origem indefinida'} -> ${item.toNumber ?? 'destino indefinido'}${item.durationSec ? ` • ${item.durationSec}s` : ''}`,
        actorName: item.agentUserId ? userNames.get(item.agentUserId) ?? null : null,
        ownerName: null,
      })),
      ...attendances.map((item) => ({
        id: `attendance-${item.id}`,
        at: item.finishedAt ?? item.acceptedAt ?? item.calledAt,
        type: 'ATTENDANCE',
        title: `Atendimento ${String(item.status).toLowerCase()}`,
        detail: [item.type, item.visitType, item.result].filter(Boolean).join(' • ') || null,
        actorName: userNames.get(item.sellerId) ?? null,
        ownerName: null,
      })),
      ...lead.assignments.map((item) => ({
        id: `assignment-${item.id}`,
        at: item.respondedAt ?? item.createdAt,
        type: 'ASSIGNMENT',
        title: `Atribuição ${item.status.toLowerCase()}`,
        detail: item.reason ?? null,
        actorName: item.assignedByUserId ? userNames.get(item.assignedByUserId) ?? null : null,
        ownerName: item.assignedToUserId ? userNames.get(item.assignedToUserId) ?? null : null,
      })),
      ...lead.claims.map((item) => ({
        id: `claim-${item.id}`,
        at: item.createdAt,
        type: 'CLAIM',
        title: item.action === 'CLAIMED' ? 'Lead assumido' : item.action === 'LOST_RACE' ? 'Tentativa sem sucesso' : item.action,
        detail: item.succeeded ? 'Assunção concluída' : null,
        actorName: userNames.get(item.userId) ?? null,
        ownerName: null,
      })),
      ...lead.tasks.map((item) => ({
        id: `task-${item.id}`,
        at: item.completedAt ?? item.dueAt ?? item.createdAt,
        type: 'TASK',
        title: item.status === 'DONE' ? `Tarefa concluída: ${item.title}` : `Tarefa ${item.status.toLowerCase()}: ${item.title}`,
        detail: item.notes ?? null,
        actorName: item.assignedToUserId ? userNames.get(item.assignedToUserId) ?? null : null,
        ownerName: null,
      })),
      ...lead.slas.map((item) => ({
        id: `sla-${item.id}`,
        at: item.breachedAt ?? item.deadline,
        type: 'SLA',
        title: item.status === 'BREACHED' ? 'SLA estourado' : `SLA ${item.status.toLowerCase()}`,
        detail: `Prazo de ${item.slaSeconds} segundos`,
        actorName: null,
        ownerName: null,
      })),
      {
        id: `lead-${lead.id}`,
        at: lead.createdAt,
        type: 'LEAD',
        title: 'Lead criado',
        detail: lead.source ?? null,
        actorName: lead.createdById ? userNames.get(lead.createdById) ?? null : null,
        ownerName: lead.assignedToUserId ? userNames.get(lead.assignedToUserId) ?? null : null,
      },
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    return NextResponse.json({
      success: true,
      data: {
        lead: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          source: lead.source,
          status: lead.status,
          notes: lead.notes,
          lostReason: lead.lostReason,
          assignedToUserId: lead.assignedToUserId,
          assignedToUserName: lead.assignedToUserId ? userNames.get(lead.assignedToUserId) ?? null : null,
          unitId: lead.unitId,
          unitName: unit?.name ?? null,
          customerId: lead.customerId,
          vehicleId: lead.vehicleId,
          convertedDealId: lead.convertedDealId,
          lastContactAt: lead.lastContactAt,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
        },
        relations: { customer, vehicle, deal, attendance },
        attendances: attendances.map((item) => ({
          ...item,
          sellerName: userNames.get(item.sellerId) ?? item.sellerId,
        })),
        calls: calls.map((item) => ({
          ...item,
          agentUserName: item.agentUserId ? userNames.get(item.agentUserId) ?? null : null,
          hasRecording: !!item.recording,
          recordingStatus: item.recording?.status ?? null,
        })),
        tasks: lead.tasks.map((item) => ({
          ...item,
          assignedToUserName: item.assignedToUserId ? userNames.get(item.assignedToUserId) ?? null : null,
        })),
        timeline,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

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
    if (!canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

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
