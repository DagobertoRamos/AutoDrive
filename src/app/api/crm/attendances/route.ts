import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { applyCrmAttendanceScope, resolveCrmAttendanceScope } from '@/lib/crm/shared'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  { const gate = await assertModuleEnabled(user, 'crm'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const scope = await resolveCrmAttendanceScope(user)
    if (!scope) return forbiddenResponse('Sem acesso aos atendimentos do CRM.')
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')?.trim() || undefined
    const result = sp.get('result')?.trim() || undefined
    const type = sp.get('type')?.trim() || undefined
    const from = sp.get('from')
    const to = sp.get('to')
    const where = applyCrmAttendanceScope({ tenantId }, scope, user)

    if (status) where.status = status as never
    if (result) where.result = result as never
    if (type) where.type = type as never
    if (from || to) {
      where.calledAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(new Date(to).getTime() + 86400000 - 1) } : {}),
      }
    }

    const rows = await prisma.sellerQueueAttendance.findMany({
      where,
      orderBy: [{ calledAt: 'desc' }],
      take: 300,
      include: {
        arrival: { select: { customerName: true, customerPhone: true, recurring: true } },
      },
    })
    const userIds = [...new Set(rows.map((row) => row.sellerId))]
    const sellerNames = new Map<string, string>()
    if (userIds.length) {
      const sellers = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      sellers.forEach((seller) => sellerNames.set(seller.id, seller.name))
    }

    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        sellerId: row.sellerId,
        sellerName: sellerNames.get(row.sellerId) ?? row.sellerId,
        unitId: row.unitId,
        status: row.status,
        result: row.result,
        type: row.type,
        visitType: row.visitType,
        leadId: row.leadId,
        dealId: row.dealId,
        calledAt: row.calledAt,
        acceptedAt: row.acceptedAt,
        finishedAt: row.finishedAt,
        customerName: row.arrival?.customerName ?? null,
        customerPhone: row.arrival?.customerPhone ?? null,
        recurring: row.arrival?.recurring ?? false,
      })),
      meta: { scope, total: rows.length },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
