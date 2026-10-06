// =============================================================================
// /api/finance/entries — lançamentos financeiros. Multi-tenant.
//   GET  : finance (read; filtros type/status/unitId/categoryId/from/to; folha só com finance.payroll)
//   POST : finance.manage (lançamento manual; source=MANUAL)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { periodError } from '@/lib/finance/period-lock'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createEntrySchema } from '@/lib/validators/finance'
import { zodErrorResponse, num, entryTextSearch } from '@/lib/finance/finance-service'
import { legacyFinanceGuard, scope, canPayroll, payrollFilter } from '@/app/api/finance/center/entries/_lib/shared'
import { tenantRefError } from '@/lib/finance/tenant-refs'

export async function GET(req: Request) {
  const g = await legacyFinanceGuard('finance', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
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

    const where = { ...scope(tenantId), ...payrollFilter(await canPayroll(user)), ...extra }
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
      categoryId: e.categoryId, accountId: e.accountId, paymentMethod: e.paymentMethod, notes: e.notes,
    }))
    const totals = Object.fromEntries(byType.map((g) => [g.type, { total: num(g._sum.amount), count: g._count._all }]))
    return NextResponse.json({ success: true, data, totals })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const g = await legacyFinanceGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
    const d = createEntrySchema.parse(await req.json())
    if (!d.dueDate) return NextResponse.json({ success: false, error: 'Informe o vencimento.' }, { status: 400 })
    const refErr = await tenantRefError(tenantId, d)
    if (refErr) return NextResponse.json({ success: false, error: refErr }, { status: 400 })
    const closed = await periodError(tenantId, [d.competenceDate ?? d.dueDate, d.status === 'PAGO' || d.status === 'RECEBIDO' ? d.paidDate ?? new Date() : null])
    if (closed) return NextResponse.json({ success: false, error: closed }, { status: 400 })
    if ((d.status === 'PAGO' && d.type !== 'DESPESA') || (d.status === 'RECEBIDO' && d.type !== 'RECEITA')) return NextResponse.json({ success: false, error: 'Status não combina com o tipo do lançamento.' }, { status: 400 })
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
