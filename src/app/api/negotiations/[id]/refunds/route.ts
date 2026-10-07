// =============================================================================
// /api/negotiations/[id]/refunds — estornos da negociação cancelada.
//   GET    : quem vê a negociação → { lines, canRefund, accounts }
//   POST   : finance.manage → { refId, kind, amount, date, accountId, method, notes }
//   DELETE : finance.manage → ?refId=&kind= (desfaz o estorno marcado por engano)
// Regras em lib/finance/deal-refunds.ts.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { financeCan, financeGuard, requireFinance } from '@/lib/finance/access'
import { loadDealRefundLines, registerRefund, undoRefund, type RefundKind } from '@/lib/finance/deal-refunds'
import { parseDateOnly } from '@/lib/negotiation/date-only'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } | Promise<{ id: string }> }
const KINDS: RefundKind[] = ['ESTORNO_CLIENTE', 'DEVOLUCAO_PROPRIETARIO']

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await Promise.resolve(ctx.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
  const deal = await prisma.deal.findFirst({ where: await buildNegotiationAccessWhere(session.user, { id }), select: { id: true, tenantId: true } })
  if (!deal) return NextResponse.json({ success: false, error: 'Negociação não encontrada' }, { status: 404 })
  const canRefund = await financeCan({ ...session.user, tenantId: deal.tenantId ?? session.user.tenantId }, 'finance.settle').catch(() => false)
  const [lines, accounts] = await Promise.all([
    loadDealRefundLines(id),
    canRefund && deal.tenantId
      ? prisma.financialAccount.findMany({ where: { tenantId: deal.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
  ])
  return NextResponse.json({ success: true, data: { lines, canRefund, accounts } })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await Promise.resolve(ctx.params)
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const perm = await requireFinance(g.user, 'finance.settle')
  if (perm) return perm
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const kind = String(body.kind ?? '') as RefundKind
  if (!KINDS.includes(kind)) return NextResponse.json({ success: false, error: 'Tipo inválido.' }, { status: 400 })
  const date = parseDateOnly(typeof body.date === 'string' ? body.date : null) ?? new Date()
  const r = await registerRefund(g.tenantId, {
    dealId: id, refId: String(body.refId ?? ''), kind,
    amount: Number(body.amount ?? 0), date,
    accountId: typeof body.accountId === 'string' && body.accountId ? body.accountId : null,
    method: typeof body.method === 'string' && body.method.trim() ? body.method.trim().slice(0, 60) : null,
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null,
    actor: { id: g.user.id, name: g.user.name, role: g.user.role },
  })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await Promise.resolve(ctx.params)
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const perm = await requireFinance(g.user, 'finance.reverse')
  if (perm) return perm
  const sp = new URL(req.url).searchParams
  const kind = String(sp.get('kind') ?? '') as RefundKind
  if (!KINDS.includes(kind)) return NextResponse.json({ success: false, error: 'Tipo inválido.' }, { status: 400 })
  const r = await undoRefund(g.tenantId, id, String(sp.get('refId') ?? ''), kind, { id: g.user.id, name: g.user.name, role: g.user.role })
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
