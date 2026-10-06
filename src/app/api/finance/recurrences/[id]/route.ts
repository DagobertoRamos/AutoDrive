// =============================================================================
// /api/finance/recurrences/[id]
//   PATCH  : finance.manage — campos parciais do POST + active (pausar/retomar).
//            Valor/dia/descrição/conta/categoria valem SÓ para os previstos futuros.
//            active=false → cancela os previstos futuros; true → reabre e gera.
//   DELETE : finance.manage — encerra: desativa, fim = hoje, cancela os previstos futuros.
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { noonUtc, todaySpYmd, ymdOf } from '@/lib/finance/recurrence-core'
import { applyRecurrenceToFuture, cancelFutureEntries, generateForRecurrence, reopenFutureEntries } from '@/lib/finance/recurrence'
import { bad, canPayroll, categoryKindError, centerRefError, supplierName } from '@/app/api/finance/center/entries/_lib/shared'
import { recurrencePatchSchema, serializeRecurrence } from '../_schema'

type Ctx = { params: Promise<{ id: string }> }

async function load(req: Request, id: string) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return { error: g.error }
  const rec = await prisma.financialRecurrence.findFirst({ where: { id, tenantId: g.tenantId } })
  if (!rec || (rec.employeeUserId && !(await canPayroll(g.user)))) return { error: bad('Recorrência não encontrada.', 404) }
  return { g, rec }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const l = await load(req, id)
  if (l.error) return l.error
  const { g, rec } = l
  try {
    const d = recurrencePatchSchema.parse(await req.json())
    if (d.employeeUserId && !(await canPayroll(g.user))) return bad('Sem acesso à folha.', 403)
    const type = d.type ?? rec.type
    const start = d.startDate ?? ymdOf(rec.startDate)
    const end = d.endDate === undefined ? (rec.endDate ? ymdOf(rec.endDate) : null) : d.endDate
    if (end && end < start) return bad('A data final é anterior ao início.')
    const refErr = await centerRefError(g.tenantId, d) ?? await categoryKindError(d.categoryId === undefined ? rec.categoryId : d.categoryId, type)
    if (refErr) return bad(refErr)

    const data: Prisma.FinancialRecurrenceUncheckedUpdateInput = {}
    if (d.type) data.type = d.type
    if (d.description !== undefined) data.description = d.description
    if (d.amount !== undefined) data.amount = d.amount
    if (d.dayOfMonth !== undefined) data.dayOfMonth = d.dayOfMonth
    for (const k of ['accountId', 'categoryId', 'costCenterId', 'employeeUserId', 'notes'] as const) if (d[k] !== undefined) data[k] = d[k] || null
    if (d.supplierId !== undefined) data.supplierId = d.supplierId || null
    if (d.counterparty !== undefined || d.supplierId !== undefined) data.counterparty = d.counterparty || (await supplierName(d.supplierId ?? rec.supplierId)) || null
    if (d.startDate !== undefined && d.startDate !== ymdOf(rec.startDate)) { data.startDate = noonUtc(d.startDate); data.generatedUntil = null }
    if (d.endDate !== undefined) data.endDate = d.endDate ? noonUtc(d.endDate) : null
    if (d.active !== undefined) data.active = d.active

    const updated = await prisma.financialRecurrence.update({ where: { id }, data })
    if (rec.active && !updated.active) await cancelFutureEntries(id)
    if (!rec.active && updated.active) await reopenFutureEntries(id)
    if (updated.active) {
      await applyRecurrenceToFuture(updated, rec)
      await generateForRecurrence(updated)
    }
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'UPDATE', entity: 'FinancialRecurrence', entityId: id, userName: g.user.name, userRole: g.user.role })
    const fresh = await prisma.financialRecurrence.findUniqueOrThrow({ where: { id } })
    return NextResponse.json({ success: true, data: serializeRecurrence(fresh) })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params
  const l = await load(req, id)
  if (l.error) return l.error
  const { g, rec } = l
  try {
    const today = todaySpYmd()
    const end = rec.endDate && ymdOf(rec.endDate) < today ? rec.endDate : noonUtc(today)
    await prisma.financialRecurrence.update({ where: { id }, data: { active: false, endDate: end } })
    const canceled = await cancelFutureEntries(id)
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'DEACTIVATE', entity: 'FinancialRecurrence', entityId: id, userName: g.user.name, userRole: g.user.role })
    return NextResponse.json({ success: true, canceled })
  } catch (err) {
    return handlePrismaError(err)
  }
}
