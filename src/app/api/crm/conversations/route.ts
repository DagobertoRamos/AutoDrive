// =============================================================================
// GET /api/crm/conversations — Caixa de Entrada (lista + contadores dos filtros).
// ?filtro=todos|meus|nao_respondidos|pendentes &q=busca
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { inboxGuard } from '@/lib/inbox/api-guard'
import { conversationScope, listConversations, type InboxFilter } from '@/lib/inbox/conversations'

export const dynamic = 'force-dynamic'

const FILTERS: InboxFilter[] = ['todos', 'meus', 'nao_respondidos', 'pendentes']

export async function GET(req: Request) {
  const g = await inboxGuard(req)
  if (!g.ok) return g.response
  const sp = new URL(req.url).searchParams
  const filter = (FILTERS.includes(sp.get('filtro') as InboxFilter) ? sp.get('filtro') : 'todos') as InboxFilter
  const items = await listConversations(g.tenantId, g.scope, g.user, { filter, q: sp.get('q') ?? '' })
  const base = { tenantId: g.tenantId, ...conversationScope(g.scope, g.user) }
  const [unread, pending] = await Promise.all([
    prisma.conversation.count({ where: { AND: [base, { status: { not: 'CLOSED' }, unreadCount: { gt: 0 } }] } }),
    prisma.conversation.count({ where: { AND: [base, { status: 'PENDING' }] } }),
  ])
  return NextResponse.json({ success: true, data: { items, counts: { unread, pending } } })
}
