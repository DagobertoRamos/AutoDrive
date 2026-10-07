// =============================================================================
// /api/crm/conversations/[id]
//   GET   — mensagens + painel (cliente, veículo, origem, responsável). Marca como lida.
//   PATCH — { status: OPEN|PENDING|CLOSED } e/ou { assumir: true }
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { inboxGuard } from '@/lib/inbox/api-guard'
import { conversationDetail, loadConversation, markConversationRead } from '@/lib/inbox/conversations'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await inboxGuard(req)
  if (!g.ok) return g.response
  const { id } = await params
  const conv = await loadConversation(g.tenantId, id, g.scope, g.user)
  if (!conv) return NextResponse.json({ success: false, error: 'Conversa não encontrada.' }, { status: 404 })
  const data = await conversationDetail(g.tenantId, conv)
  if (conv.unreadCount && (!conv.assignedToUserId || conv.assignedToUserId === g.user.id)) await markConversationRead(conv.id)
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await inboxGuard(req)
  if (!g.ok) return g.response
  const { id } = await params
  const conv = await loadConversation(g.tenantId, id, g.scope, g.user)
  if (!conv) return NextResponse.json({ success: false, error: 'Conversa não encontrada.' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { status?: string; assumir?: boolean }
  const data: { status?: string; assignedToUserId?: string } = {}
  if (body.status && ['OPEN', 'PENDING', 'CLOSED'].includes(body.status)) data.status = body.status
  if (body.assumir) {
    // Sem dono: qualquer um com acesso assume. Com dono: só quem vê além das próprias (gestor).
    if (conv.assignedToUserId && conv.assignedToUserId !== g.user.id && g.scope === 'own') {
      return NextResponse.json({ success: false, error: 'Esta conversa já tem responsável.' }, { status: 409 })
    }
    data.assignedToUserId = g.user.id
  }
  if (!Object.keys(data).length) return NextResponse.json({ success: false, error: 'Nada para alterar.' }, { status: 400 })
  await prisma.conversation.update({ where: { id: conv.id }, data })
  return NextResponse.json({ success: true })
}
