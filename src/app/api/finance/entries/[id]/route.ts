// =============================================================================
// /api/finance/entries/[id] — ver / editar / liquidar / excluir lançamento.
//   GET    : finance (read)
//   PATCH  : finance.manage (edita campos; status PAGO/RECEBIDO grava paidDate)
//   DELETE : finance.manage (hard delete de lançamento MANUAL/recorrência; integrados são cancelados)
// Folha (lançamento com colaborador) só com finance.payroll.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateEntrySchema } from '@/lib/validators/finance'
import { zodErrorResponse, num } from '@/lib/finance/finance-service'
import { applyStatusSideEffects } from '@/lib/finance/entry-settlement'
import { tenantRefError } from '@/lib/finance/tenant-refs'
import { entryAccessError, isDeletableSource, legacyFinanceGuard } from '@/app/api/finance/center/entries/_lib/shared'
import { deleteEntriesFiles } from './attachments/_storage'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const g = await legacyFinanceGuard('finance', req)
  if (g.error) return g.error
  const { id } = await params

  try {
    const e = await prisma.financialEntry.findUnique({ where: { id }, include: { account: true, category: true } })
    const denied = await entryAccessError(e, g)
    if (denied || !e) return denied
    return NextResponse.json({ success: true, data: { ...e, amount: num(e.amount) } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await legacyFinanceGuard('finance.manage', req)
  if (g.error) return g.error
  const { user } = g
  const { id } = await params

  try {
    const existing = await prisma.financialEntry.findUnique({ where: { id } })
    const denied = await entryAccessError(existing, g)
    if (denied || !existing) return denied
    if (existing.parentEntryId) return NextResponse.json({ success: false, error: 'Esta linha é uma baixa: para desfazer, use Estornar.' }, { status: 400 })

    const d = updateEntrySchema.parse(await req.json())
    const refErr = await tenantRefError(existing.tenantId, d)
    if (refErr) return NextResponse.json({ success: false, error: refErr }, { status: 400 })
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) if (v !== undefined) updateData[k] = v

    // Liquidação: ao marcar PAGO/RECEBIDO sem data, registra agora.
    if ((d.status === 'PAGO' || d.status === 'RECEBIDO') && !d.paidDate && !existing.paidDate) {
      updateData.paidDate = new Date()
    }

    const entry = await prisma.financialEntry.update({ where: { id }, data: updateData })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role })

    // Baixa/estorno → comissão (sistema de comissões) e pagamento da negociação acompanham.
    if (d.status) await applyStatusSideEffects(existing, d.status, (updateData.paidDate as Date | undefined) ?? existing.paidDate)
    return NextResponse.json({ success: true, data: { ...entry, amount: num(entry.amount) } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await legacyFinanceGuard('finance.manage', req)
  if (g.error) return g.error
  const { user } = g
  const { id } = await params

  try {
    const existing = await prisma.financialEntry.findUnique({ where: { id } })
    const denied = await entryAccessError(existing, g)
    if (denied || !existing) return denied
    if (existing.parentEntryId) return NextResponse.json({ success: false, error: 'Esta linha é uma baixa: use Estornar.' }, { status: 400 })
    if (await prisma.financialEntry.count({ where: { parentEntryId: id } })) return NextResponse.json({ success: false, error: 'O título tem baixas: estorne-as antes.' }, { status: 400 })
    // Lançamentos integrados (VENDA/COMISSAO/TRANSFER...) não são apagados manualmente — cancela.
    if (!isDeletableSource(existing.source)) {
      await prisma.financialEntry.update({ where: { id }, data: { status: 'CANCELADO' } })
      await applyStatusSideEffects(existing, 'CANCELADO', null)
      await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'CANCEL', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, canceled: true })
    }
    await deleteEntriesFiles([id]).catch(() => {})
    await prisma.financialEntry.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
