import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { applyCrmAttendanceScope, applyCrmScope, crmSourceLabel, crmStageLabel, resolveCrmAttendanceScope, resolveCrmScope } from '@/lib/crm/shared'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const [leadScope, attendanceScope] = await Promise.all([resolveCrmScope(user), resolveCrmAttendanceScope(user)])
    if (!leadScope || !attendanceScope) return forbiddenResponse('Sem acesso ao CRM.')
    const leadWhere = applyCrmScope({ tenantId }, leadScope, user)
    const attendanceWhere = applyCrmAttendanceScope({ tenantId }, attendanceScope, user)
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)

    const [totalLeads, delayedLeads, newLeads, convertedLeads, lostLeads, totalAttendances, openAttendances, todayAttendances, bySource, bySeller, byStage, autoconfLeads] = await Promise.all([
      prisma.marketingLead.count({ where: leadWhere }),
      prisma.marketingLead.count({ where: { ...leadWhere, status: { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] }, lastContactAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } } }),
      prisma.marketingLead.count({ where: { ...leadWhere, status: 'NEW' } }),
      prisma.marketingLead.count({ where: { ...leadWhere, status: 'CONVERTED' } }),
      prisma.marketingLead.count({ where: { ...leadWhere, status: 'LOST' } }),
      prisma.sellerQueueAttendance.count({ where: attendanceWhere }),
      prisma.sellerQueueAttendance.count({ where: { ...attendanceWhere, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } } }),
      prisma.sellerQueueAttendance.count({ where: { ...attendanceWhere, calledAt: { gte: startToday } } }),
      prisma.marketingLead.groupBy({ by: ['source'], where: leadWhere, _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 6 }),
      prisma.marketingLead.groupBy({ by: ['assignedToUserId'], where: leadWhere, _count: { _all: true }, orderBy: { _count: { assignedToUserId: 'desc' } }, take: 6 }),
      prisma.marketingLead.groupBy({ by: ['status'], where: leadWhere, _count: { _all: true }, orderBy: { _count: { status: 'desc' } }, take: 8 }),
      prisma.marketingLead.count({ where: { ...leadWhere, source: 'AUTOCONF' } }),
    ])

    const sellerIds = bySeller.map((item) => item.assignedToUserId).filter((id): id is string => Boolean(id))
    const sellers = sellerIds.length ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } }) : []
    const sellerNames = new Map(sellers.map((item) => [item.id, item.name]))

    return NextResponse.json({
      success: true,
      data: {
        scope: leadScope,
        cards: {
          totalLeads,
          newLeads,
          delayedLeads,
          convertedLeads,
          lostLeads,
          autoconfLeads,
          totalAttendances,
          openAttendances,
          todayAttendances,
        },
        bySource: bySource.map((item) => ({ source: crmSourceLabel(item.source), total: item._count._all })),
        byStage: byStage.map((item) => ({ stage: item.status, label: crmStageLabel(item.status), total: item._count._all })),
        bySeller: bySeller.map((item) => ({ sellerId: item.assignedToUserId, sellerName: item.assignedToUserId ? sellerNames.get(item.assignedToUserId) ?? 'Responsável' : 'Sem responsável', total: item._count._all })),
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
