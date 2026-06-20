// =============================================================================
// /api/finance/entries — lançamentos financeiros. Multi-tenant.
//   GET  : finance (read; filtros type/status/unitId/categoryId/from/to)
//   POST : finance.manage (lançamento manual; source=MANUAL)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createEntrySchema } from '@/lib/validators/finance'
import { zodErrorResponse, num, entryTextSearch } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance')) return forbiddenResponse('Sem acesso ao financeiro.')
  { const gate = await assertModuleEnabled(user, 'finance'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const extra: Record<string, unknown> = {}
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const unitId = searchParams.get('unitId')
    const categoryId = searchParams.get('categoryId')
    if (type === 'RECEITA' || type === 'DESPESA') extra.type = type
    if (status) extra.status = status
    if (unitId) extra.unitId = unitId
    if (categoryId) extra.categoryId = categoryId
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (from || to) {
      extra.dueDate = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }
    }
    const searchOr = entryTextSearch(searchParams.get('q'))
    if (searchOr) extra.OR = searchOr

    const where = tenantWhere(user.role, tenantId, extra)
    const [rows, byType] = await Promise.all([
      prisma.financialEntry.findMany({
        where: where as never,
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        include: { account: { select: { name: true } }, category: { select: { name: true, kind: true } } },
      }),
      prisma.financialEntry.groupBy({ by: ['type'], where: where as never, _sum: { amount: true }, _count: { _all: true } }),
    ])

    const data = rows.map((e) => ({
      id: e.id, type: e.type, status: e.status, description: e.description, amount: num(e.amount),
      dueDate: e.dueDate, paidDate: e.paidDate, competenceDate: e.competenceDate,
      account: e.account?.name ?? null, category: e.category?.name ?? null,
      source: e.source, counterparty: e.counterparty, documentNumber: e.documentNumber,
      unitId: e.unitId, sellerId: e.sellerId, createdAt: e.createdAt,
    }))
    const totals = Object.fromEntries(byType.map((g) => [g.type, { total: num(g._sum.amount), count: g._count._all }]))
    return NextResponse.json({ success: true, data, totals })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance.manage')) return forbiddenResponse('Sem permissão para lançar.')
  { const gate = await assertModuleEnabled(user, 'finance'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const d = createEntrySchema.parse(await req.json())
    const entry = await prisma.financialEntry.create({
      data: {
        tenantId, type: d.type, status: d.status, description: d.description, amount: d.amount,
        dueDate: d.dueDate ?? null, paidDate: d.paidDate ?? null, competenceDate: d.competenceDate ?? d.dueDate ?? null,
        accountId: d.accountId ?? null, categoryId: d.categoryId ?? null, unitId: d.unitId ?? null, sellerId: d.sellerId ?? null,
        counterparty: d.counterparty ?? null, documentNumber: d.documentNumber ?? null, paymentMethod: d.paymentMethod ?? null,
        notes: d.notes ?? null, source: 'MANUAL', createdById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialEntry', entityId: entry.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: entry }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
