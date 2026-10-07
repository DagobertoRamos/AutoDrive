// =============================================================================
// GET /api/negotiations/[id]/result — resultado completo da negociação
// (lib/finance/deal-result). Só quem vê lucro: financeiro liberado,
// gerente geral, ADM e MASTER.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { hasFinanceAccess } from '@/lib/finance/access'
import { loadDealResult } from '@/lib/finance/deal-result'

export const dynamic = 'force-dynamic'
const PROFIT_ROLES = ['GERENTE_GERAL', 'ADM', 'MASTER']

export async function GET(_req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctx.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
  const deal = await prisma.deal.findFirst({ where: await buildNegotiationAccessWhere(session.user, { id }), select: { id: true, tenantId: true } })
  if (!deal?.tenantId) return NextResponse.json({ success: false, error: 'Negociação não encontrada' }, { status: 404 })
  const allowed = PROFIT_ROLES.includes(session.user.role) || await hasFinanceAccess({ ...session.user, tenantId: deal.tenantId }).catch(() => false)
  if (!allowed) return NextResponse.json({ success: false, error: 'Sem acesso ao resultado.' }, { status: 403 })
  const result = await loadDealResult(deal.tenantId, id)
  return NextResponse.json({ success: true, data: result })
}
