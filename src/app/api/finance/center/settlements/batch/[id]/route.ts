// =============================================================================
// /api/finance/center/settlements/batch/[id]
//   GET  → lote com as baixas (comprovante)
//   POST { action: 'reverse', reason } → estorna o lote inteiro
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { financeGuard, requireFinance } from '@/lib/finance/access'
import { reverseBatch } from '@/lib/finance/settlement'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { id } = await params
  const batch = await prisma.financialSettlementBatch.findFirst({
    where: { id, tenantId: g.tenantId },
    include: {
      entries: {
        select: { id: true, description: true, amount: true, interestAmount: true, discountAmount: true, counterparty: true, documentNumber: true, dueDate: true, parentEntryId: true, status: true },
        orderBy: { description: 'asc' },
      },
    },
  })
  if (!batch) return NextResponse.json({ success: false, error: 'Lote não encontrado.' }, { status: 404 })
  const account = batch.accountId ? await prisma.financialAccount.findUnique({ where: { id: batch.accountId }, select: { name: true } }) : null
  return NextResponse.json({
    success: true,
    data: {
      ...batch, total: Number(batch.total), account: account?.name ?? null,
      // O comprovante vem da foto gravada no lote (vale mesmo depois do estorno).
      entries: Array.isArray(batch.snapshot)
        ? (batch.snapshot as Array<{ entryId: string; description: string; counterparty: string | null; dueDate: string | null; principal: number; interest: number; discount: number; paid: number; kind: string }>).map((x) => ({
            id: x.entryId, description: x.description, counterparty: x.counterparty, dueDate: x.dueDate, documentNumber: null,
            amount: x.paid, principal: x.principal, interestAmount: x.interest || null, discountAmount: x.discount || null, partial: x.kind === 'PARTIAL', parentEntryId: null, status: batch.reversedAt ? 'ESTORNADO' : 'BAIXADO',
          }))
        : batch.entries.map((e) => ({ ...e, amount: Number(e.amount), interestAmount: e.interestAmount == null ? null : Number(e.interestAmount), discountAmount: e.discountAmount == null ? null : Number(e.discountAmount), partial: !!e.parentEntryId })),
    },
  })
}

export async function POST(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const perm = await requireFinance(g.user, 'finance.reverse')
  if (perm) return perm
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string }
  if (body.action !== 'reverse') return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
  const err = await reverseBatch(g.tenantId, id, String(body.reason ?? '').slice(0, 300), { id: g.user.id, name: g.user.name, role: g.user.role })
  if (err) return NextResponse.json({ success: false, error: err }, { status: 400 })
  return NextResponse.json({ success: true })
}
