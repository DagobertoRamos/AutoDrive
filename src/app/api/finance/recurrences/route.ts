// =============================================================================
// /api/finance/recurrences — receitas/despesas fixas (aluguel, salário, sistemas…).
//   GET  : finance — ?employeeUserId= &type=RECEITA|DESPESA &active=true|false
//          → { success, data: [recurrence + { nextDueDate, generated, account, category,
//                                               costCenter, supplier, employee }] }
//          Recorrências de folha (employeeUserId) só com finance.payroll.
//   POST : finance.manage — { type, description, amount, accountId?, categoryId?, costCenterId?,
//          supplierId?, employeeUserId?, counterparty?, dayOfMonth (1–31), startDate 'YYYY-MM-DD',
//          endDate?, notes? } → { success, data: recurrence } e já gera os previstos (hoje + 3 meses).
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { noonUtc } from '@/lib/finance/recurrence-core'
import { generateForRecurrence, recurrenceStats } from '@/lib/finance/recurrence'
import { bad, canPayroll, categoryKindError, centerRefError, supplierName } from '@/app/api/finance/center/entries/_lib/shared'
import { recurrenceSchema, serializeRecurrence } from './_schema'

export const dynamic = 'force-dynamic'

const include = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, code: true } },
  costCenter: { select: { id: true, name: true } },
} satisfies Prisma.FinancialRecurrenceInclude

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  try {
    const sp = new URL(req.url).searchParams
    const payroll = await canPayroll(g.user)
    const employeeUserId = sp.get('employeeUserId')
    if (employeeUserId && !payroll) return bad('Sem acesso à folha.', 403)
    const where: Prisma.FinancialRecurrenceWhereInput = { tenantId: g.tenantId, ...(payroll ? {} : { employeeUserId: null }) }
    if (employeeUserId) where.employeeUserId = employeeUserId
    const type = sp.get('type'); if (type === 'RECEITA' || type === 'DESPESA') where.type = type
    const active = sp.get('active'); if (active === 'true' || active === 'false') where.active = active === 'true'
    const rows = await prisma.financialRecurrence.findMany({ where, include, orderBy: [{ active: 'desc' }, { dayOfMonth: 'asc' }, { description: 'asc' }] })
    const stats = await recurrenceStats(rows)
    const supIds = [...new Set(rows.map((r) => r.supplierId).filter((v): v is string => !!v))]
    const empIds = [...new Set(rows.map((r) => r.employeeUserId).filter((v): v is string => !!v))]
    const [sups, emps] = await Promise.all([
      supIds.length ? prisma.supplier.findMany({ where: { id: { in: supIds } }, select: { id: true, name: true } }) : [],
      empIds.length ? prisma.user.findMany({ where: { id: { in: empIds } }, select: { id: true, name: true } }) : [],
    ])
    const sMap = new Map(sups.map((s) => [s.id, s])); const eMap = new Map(emps.map((u) => [u.id, u]))
    const data = rows.map((r) => ({
      ...serializeRecurrence(r),
      supplier: r.supplierId ? sMap.get(r.supplierId) ?? null : null,
      employee: r.employeeUserId ? eMap.get(r.employeeUserId) ?? null : null,
      ...stats.get(r.id)!,
    }))
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  try {
    const d = recurrenceSchema.parse(await req.json())
    if (d.employeeUserId && !(await canPayroll(user))) return bad('Sem acesso à folha.', 403)
    if (d.endDate && d.endDate < d.startDate) return bad('A data final é anterior ao início.')
    const refErr = await centerRefError(tenantId, d) ?? await categoryKindError(d.categoryId, d.type)
    if (refErr) return bad(refErr)
    const rec = await prisma.financialRecurrence.create({
      data: {
        tenantId, type: d.type, description: d.description, amount: d.amount,
        accountId: d.accountId || null, categoryId: d.categoryId || null, costCenterId: d.costCenterId || null,
        supplierId: d.supplierId || null, employeeUserId: d.employeeUserId || null,
        counterparty: d.counterparty || (await supplierName(d.supplierId)) || null,
        dayOfMonth: d.dayOfMonth, startDate: noonUtc(d.startDate), endDate: d.endDate ? noonUtc(d.endDate) : null,
        notes: d.notes || null, active: d.active ?? true, createdById: user.id,
      },
    })
    const created = await generateForRecurrence(rec)
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialRecurrence', entityId: rec.id, userName: user.name, userRole: user.role })
    const fresh = await prisma.financialRecurrence.findUniqueOrThrow({ where: { id: rec.id }, include })
    const stats = (await recurrenceStats([fresh])).get(rec.id)!
    return NextResponse.json({ success: true, data: { ...serializeRecurrence(fresh), ...stats, createdEntries: created } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
