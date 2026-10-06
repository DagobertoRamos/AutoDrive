// =============================================================================
// /api/finance/center/entries/[id]
//   PATCH : finance.manage — edita o lançamento (descrição, valor, datas, conta,
//           categoria, centro de custo, fornecedor/contraparte, documento, forma, obs.)
//           { description?, amount?, dueDate?, competenceDate?, accountId?, categoryId?, costCenterId?,
//             supplierId?, counterparty?, documentNumber?, paymentMethod?, notes?, vehicleId? }
//   POST  : finance.manage — ações { action: 'settle', paidDate, accountId?, paymentMethod?,
//           paidAmount?, interestAmount?, discountAmount? } | { action: 'cancel', reason? }
// Status (estorno/reabrir) segue por PATCH /api/finance/entries/[id].
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { noonUtc } from '@/lib/finance/recurrence-core'
import { bad, categoryKindError, centerRefError, entryAccessError, supplierName } from '../_lib/shared'
import { cancelEntry, settleEntry, settleSchema } from '../_lib/settle'

type Ctx = { params: Promise<{ id: string }> }

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const optId = z.string().max(40).nullable().optional()
const optText = (max: number) => z.string().trim().max(max).nullable().optional()
const patchSchema = z.object({
  description: z.string().trim().min(2, 'Informe a descrição.').max(240).optional(),
  amount: z.coerce.number().positive('Informe o valor.').max(100_000_000).optional(),
  dueDate: ymd.optional(),
  competenceDate: ymd.nullable().optional(),
  accountId: optId, categoryId: optId, costCenterId: optId, supplierId: optId, vehicleId: optId,
  counterparty: optText(160), documentNumber: optText(80), paymentMethod: optText(60), notes: optText(2000),
})

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { id } = await params
  try {
    const e = await prisma.financialEntry.findUnique({ where: { id } })
    const denied = await entryAccessError(e, g)
    if (denied || !e) return denied
    if (e.transferGroupId) return bad('Transferência: exclua e lance de novo.')
    const d = patchSchema.parse(await req.json())
    const refErr = await centerRefError(g.tenantId, d) ?? await categoryKindError(d.categoryId, e.type)
    if (refErr) return bad(refErr)
    if (d.vehicleId && !(await prisma.vehicle.findFirst({ where: { id: d.vehicleId, tenantId: g.tenantId }, select: { id: true } }))) return bad('Veículo inválido.')
    if (d.amount !== undefined && d.amount !== Number(e.amount)) {
      if (e.commissionCalculationId) return bad('Comissão: o valor vem do sistema de comissões.')
      if (e.vehicleServiceId) return bad('Custo de serviço: altere o valor na aba Serviços do veículo.')
    }
    const data: Prisma.FinancialEntryUncheckedUpdateInput = {}
    if (d.description !== undefined) data.description = d.description
    if (d.amount !== undefined) data.amount = d.amount
    if (d.dueDate !== undefined) data.dueDate = noonUtc(d.dueDate)
    if (d.competenceDate !== undefined) data.competenceDate = d.competenceDate ? noonUtc(d.competenceDate) : (d.dueDate ? noonUtc(d.dueDate) : e.dueDate)
    for (const k of ['accountId', 'categoryId', 'costCenterId', 'vehicleId', 'documentNumber', 'paymentMethod', 'notes'] as const) {
      if (d[k] !== undefined) data[k] = d[k] || null
    }
    if (d.supplierId !== undefined) data.supplierId = d.supplierId || null
    if (d.counterparty !== undefined || d.supplierId !== undefined) {
      data.counterparty = d.counterparty || (await supplierName(d.supplierId ?? e.supplierId)) || null
    }
    const row = await prisma.financialEntry.update({ where: { id }, data })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'UPDATE', entity: 'FinancialEntry', entityId: id, userName: g.user.name, userRole: g.user.role })
    return NextResponse.json({ success: true, data: { ...row, amount: Number(row.amount) } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { id } = await params
  try {
    const e = await prisma.financialEntry.findUnique({ where: { id }, select: { tenantId: true, employeeUserId: true } })
    const denied = await entryAccessError(e, g)
    if (denied) return denied
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    let error: string | null
    if (body.action === 'settle') {
      const s = settleSchema.parse(body)
      error = await centerRefError(g.tenantId, { accountId: s.accountId }) ?? await settleEntry(id, s)
    } else if (body.action === 'cancel') {
      error = await cancelEntry(id, typeof body.reason === 'string' ? body.reason.slice(0, 300) : null)
    } else {
      return bad('Ação inválida.')
    }
    if (error) return bad(error)
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: body.action === 'settle' ? 'SETTLE' : 'CANCEL', entity: 'FinancialEntry', entityId: id, userName: g.user.name, userRole: g.user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
