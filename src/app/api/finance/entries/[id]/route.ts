// =============================================================================
// /api/finance/entries/[id] — ver / editar / liquidar / excluir lançamento.
//   GET    : finance (read)
//   PATCH  : finance.manage (edita campos; status passa por baixa/estorno/cancelamento)
//   DELETE : finance.manage (nunca apaga: cancela com motivo — voidEntry)
// Folha (lançamento com colaborador) só com finance.payroll.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateEntrySchema } from '@/lib/validators/finance'
import { zodErrorResponse, num } from '@/lib/finance/finance-service'
import { reverseSettlement, settleTitle } from '@/lib/finance/settlement'
import { entryDiff } from '@/lib/finance/entry-audit'
import { tenantRefError } from '@/lib/finance/tenant-refs'
import { entryAccessError, legacyFinanceGuard } from '@/app/api/finance/center/entries/_lib/shared'
import { voidEntry } from '@/app/api/finance/center/entries/_lib/settle'

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

    const body = await req.json()
    const d = updateEntrySchema.parse(body)
    const refErr = await tenantRefError(existing.tenantId, d)
    if (refErr) return NextResponse.json({ success: false, error: refErr }, { status: 400 })
    const actor = { id: user.id, name: user.name, role: user.role }
    const settled = existing.status === 'PAGO' || existing.status === 'RECEBIDO'

    // Mudança de status passa SEMPRE pelas regras de baixa/estorno/cancelamento.
    if (d.status && d.status !== existing.status) {
      let err: string | null = null
      if (d.status === 'CANCELADO') err = await voidEntry(id, typeof body?.reason === 'string' ? body.reason : null, actor)
      else if (d.status === 'PREVISTO') {
        const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
        err = await reverseSettlement(existing.tenantId, id, reason || 'Estorno pelo lançamento', actor)
      } else {
        if ((d.status === 'PAGO') !== (existing.type === 'DESPESA')) err = 'Status não combina com o tipo do lançamento.'
        else {
          const paid = d.paidDate ?? new Date()
          const r = await settleTitle(existing.tenantId, id, { paidDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(paid), accountId: d.accountId ?? undefined, paymentMethod: d.paymentMethod ?? undefined }, actor)
          err = 'error' in r ? r.error : null
        }
      }
      if (err) return NextResponse.json({ success: false, error: err }, { status: 400 })
    }

    // Demais campos. Valor e tipo de lançamento já baixado não mudam (estorne antes).
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) if (v !== undefined && k !== 'status' && k !== 'paidDate') updateData[k] = v
    if (settled && ((d.amount !== undefined && Math.abs(Number(d.amount) - Number(existing.amount)) > 0.004) || (d.type && d.type !== existing.type))) {
      return NextResponse.json({ success: false, error: 'Lançamento baixado: estorne a baixa para mudar valor ou tipo.' }, { status: 400 })
    }
    if (d.categoryId) {
      const cat = await prisma.financialCategory.findFirst({ where: { id: d.categoryId }, select: { kind: true } })
      if (cat && cat.kind !== (d.type ?? existing.type)) return NextResponse.json({ success: false, error: 'A categoria não é do mesmo tipo do lançamento.' }, { status: 400 })
    }
    const current = await prisma.financialEntry.findUniqueOrThrow({ where: { id } })
    const entry = Object.keys(updateData).length ? await prisma.financialEntry.update({ where: { id }, data: updateData }) : current
    const changed = entryDiff(current as unknown as Record<string, unknown>, entry as unknown as Record<string, unknown>)
    if (changed) await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role, beforeData: changed.before, afterData: changed.after })
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
    const reason = new URL(req.url).searchParams.get('reason')
    const err = await voidEntry(id, reason, { id: user.id, name: user.name, role: user.role })
    if (err) return NextResponse.json({ success: false, error: err }, { status: 400 })
    return NextResponse.json({ success: true, canceled: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
