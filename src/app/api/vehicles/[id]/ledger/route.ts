// =============================================================================
// /api/vehicles/[id]/ledger — extrato financeiro do veículo.
//   GET  → linhas (lançamentos + venda + comissões ao vivo) e resultado
//   POST { type, category, description, amount, dueDate?, counterparty?, paid?, paidDate?, paymentMethod? }
// Cada lançamento é um FinancialEntry (aparece em Financeiro › Lançamentos/DRE).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { vehicleGuard } from '@/lib/stock/vehicle-guard'
import { EXPENSE_LABEL, REVENUE_LABEL } from '@/lib/stock/prep-core'
import { ensureVehicleCategory, loadVehicleLedger, sourceOf } from '@/lib/stock/vehicle-ledger'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'finance')
    if ('error' in g) return g.error
    const accounts = await prisma.financialAccount.findMany({ where: { tenantId: g.vehicle.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    return NextResponse.json({ success: true, data: { ...(await loadVehicleLedger(id)), accounts } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'finance')
    if ('error' in g) return g.error
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const type = b.type === 'RECEITA' ? 'RECEITA' : 'DESPESA'
    const category = String(b.category ?? 'OUTRO').toUpperCase()
    const valid = type === 'DESPESA' ? category in EXPENSE_LABEL : category in REVENUE_LABEL
    if (!valid || category === 'COMISSAO' || category === 'VENDA_VEICULO') return NextResponse.json({ success: false, error: 'Categoria inválida (comissão e venda vêm dos seus sistemas).' }, { status: 400 })
    const amount = Math.round(Number(b.amount) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ success: false, error: 'Informe o valor.' }, { status: 400 })
    const description = String(b.description ?? '').trim().slice(0, 200)
    if (!description) return NextResponse.json({ success: false, error: 'Descreva o lançamento.' }, { status: 400 })
    const date = (v: unknown) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? new Date(v) : null)
    const paid = b.paid === true
    const v = await prisma.vehicle.findUnique({ where: { id }, select: { unitId: true } })
    const entry = await prisma.financialEntry.create({
      data: {
        tenantId: g.vehicle.tenantId, unitId: v?.unitId ?? null, vehicleId: id, type, source: sourceOf(category),
        categoryId: await ensureVehicleCategory(g.vehicle.tenantId, category, type),
        status: paid ? (type === 'RECEITA' ? 'RECEBIDO' : 'PAGO') : 'PREVISTO',
        description, amount, dueDate: date(b.dueDate), competenceDate: date(b.dueDate) ?? new Date(),
        paidDate: paid ? date(b.paidDate) ?? new Date() : null, paymentMethod: String(b.paymentMethod ?? '').slice(0, 40) || null,
        accountId: typeof b.accountId === 'string' && b.accountId ? b.accountId : null,
        counterparty: String(b.counterparty ?? '').trim().slice(0, 120) || null, notes: String(b.notes ?? '').trim().slice(0, 1000) || null,
        createdById: g.user.id,
      },
    })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.vehicle.tenantId, action: 'CREATE', entity: 'FinancialEntry', entityId: entry.id, userName: g.user.name, userRole: g.user.role, afterData: { vehicleId: id, category, amount } })
    return NextResponse.json({ success: true, data: entry }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
