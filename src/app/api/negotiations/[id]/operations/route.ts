// =============================================================================
// /api/negotiations/[id]/operations — operações (TXN) dos veículos da
// negociação: venda do carro da loja e, na troca, a entrada do carro do cliente.
//   GET  → cria as que faltam (negociação aprovada em diante) e devolve com
//          status geral; negociações antigas não ganham operação sozinhas.
//   POST { action: 'start' } → começa o acompanhamento de uma negociação antiga.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { opsPermissions } from '@/lib/automotive/access'
import { dealOperations } from '@/lib/automotive/overview'
import { syncDealOperations } from '@/lib/automotive/operations'
import { opsError, opsSession, requireOps } from '@/lib/automotive/route-helpers'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function scopedDeal(id: string, user: unknown) {
  return prisma.deal.findFirst({ where: await buildNegotiationAccessWhere(user as never, { id }), select: { id: true, status: true, customer: { select: { name: true, phone: true } } } })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    const { id } = await ctx.params
    const deal = await scopedDeal(id, s.user)
    if (!deal) return NextResponse.json({ success: false, error: 'Negociação não encontrada.' }, { status: 404 })
    const perms = await opsPermissions(s.user)
    const data = await dealOperations(deal.id, s.actor)
    return NextResponse.json({ success: true, data: { ...data, fiscalDocs: perms['ops.fiscal.view'] ? data.fiscalDocs : [], customer: deal.customer, permissions: perms } })
  } catch (err) {
    return opsError(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    const { id } = await ctx.params
    const deal = await scopedDeal(id, s.user)
    if (!deal) return NextResponse.json({ success: false, error: 'Negociação não encontrada.' }, { status: 404 })
    const b = await req.json().catch(() => ({})) as { action?: string }
    if (b.action !== 'start') return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
    const d = await requireOps(s, 'ops.renave.operate'); if (d) return d
    await syncDealOperations(deal.id, s.actor)
    return NextResponse.json({ success: true })
  } catch (err) {
    return opsError(err)
  }
}
