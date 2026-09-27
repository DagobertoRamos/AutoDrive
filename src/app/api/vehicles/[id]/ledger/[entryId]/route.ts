// =============================================================================
// PATCH /api/vehicles/[id]/ledger/[entryId] — conciliação de um lançamento do veículo.
//   { action: 'pay', paidDate?, paymentMethod?, accountId?, amount? }  dá baixa
//   { action: 'unpay' }                                                 estorna a baixa
//   { action: 'cancel' }                                                cancela
//   { action: 'edit', description?, amount?, dueDate?, counterparty?, notes? }
// Valor de lançamento de serviço só muda pela aba Serviços. Comissão: baixa no
// sistema de comissões (reflete sozinha no extrato).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { vehicleGuard } from '@/lib/stock/vehicle-guard'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; entryId: string }> }) {
  try {
    const { id, entryId } = await ctx.params
    const g = await vehicleGuard(id, 'finance')
    if ('error' in g) return g.error
    const e = await prisma.financialEntry.findFirst({ where: { id: entryId, OR: [{ vehicleId: id }, { dealId: { not: null }, source: 'VENDA' }] } })
    if (!e) return NextResponse.json({ success: false, error: 'Lançamento não encontrado.' }, { status: 404 })
    if (e.tenantId && g.vehicle.tenantId && e.tenantId !== g.vehicle.tenantId) return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
    if (e.commissionCalculationId) return NextResponse.json({ success: false, error: 'Comissão: dê baixa no sistema de comissões.' }, { status: 400 })

    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const date = (v: unknown) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? new Date(v) : undefined)
    const money = (v: unknown) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n > 0 ? n : undefined }
    let data: Prisma.FinancialEntryUpdateInput
    switch (b.action) {
      case 'pay': {
        if (e.status === 'CANCELADO') return NextResponse.json({ success: false, error: 'Lançamento cancelado.' }, { status: 400 })
        const amount = b.amount != null ? money(b.amount) : undefined
        if (b.amount != null && amount === undefined) return NextResponse.json({ success: false, error: 'Valor inválido.' }, { status: 400 })
        if (amount !== undefined && e.vehicleServiceId && amount !== Number(e.amount)) return NextResponse.json({ success: false, error: 'Valor do serviço: ajuste o valor real na aba Serviços.' }, { status: 400 })
        data = {
          status: e.type === 'RECEITA' ? 'RECEBIDO' : 'PAGO', paidDate: date(b.paidDate) ?? new Date(),
          paymentMethod: String(b.paymentMethod ?? e.paymentMethod ?? '').slice(0, 40) || null,
          ...(typeof b.accountId === 'string' && b.accountId ? { account: { connect: { id: b.accountId } } } : {}),
          ...(amount !== undefined ? { amount } : {}),
        }
        break
      }
      case 'unpay': data = { status: 'PREVISTO', paidDate: null }; break
      case 'cancel':
        if (e.status === 'PAGO' || e.status === 'RECEBIDO') return NextResponse.json({ success: false, error: 'Estorne a baixa antes de cancelar.' }, { status: 400 })
        if (e.vehicleServiceId) return NextResponse.json({ success: false, error: 'Serviço: negue/cancele na aba Serviços.' }, { status: 400 })
        data = { status: 'CANCELADO' }
        break
      case 'edit': {
        data = {}
        if (typeof b.description === 'string' && b.description.trim()) data.description = b.description.trim().slice(0, 200)
        if (b.amount !== undefined) {
          const amount = money(b.amount)
          if (amount === undefined) return NextResponse.json({ success: false, error: 'Valor inválido.' }, { status: 400 })
          if (e.vehicleServiceId) return NextResponse.json({ success: false, error: 'Valor do serviço: ajuste na aba Serviços.' }, { status: 400 })
          data.amount = amount
        }
        if (b.dueDate !== undefined) data.dueDate = date(b.dueDate) ?? null
        if (b.counterparty !== undefined) data.counterparty = String(b.counterparty ?? '').trim().slice(0, 120) || null
        if (b.notes !== undefined) data.notes = String(b.notes ?? '').trim().slice(0, 1000) || null
        break
      }
      default: return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
    }
    const updated = await prisma.financialEntry.update({ where: { id: e.id }, data })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.vehicle.tenantId, action: `LEDGER_${String(b.action).toUpperCase()}`, entity: 'FinancialEntry', entityId: e.id, userName: g.user.name, userRole: g.user.role, beforeData: { status: e.status, amount: Number(e.amount) }, afterData: { status: updated.status, amount: Number(updated.amount) } })
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
