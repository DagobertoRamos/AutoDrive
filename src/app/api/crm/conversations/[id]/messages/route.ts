// POST /api/crm/conversations/[id]/messages — { text } responde pelo mesmo canal.
import { NextResponse } from 'next/server'
import { inboxGuard } from '@/lib/inbox/api-guard'
import { loadConversation, sendConversationReply } from '@/lib/inbox/conversations'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await inboxGuard(req)
  if (!g.ok) return g.response
  const { id } = await params
  const conv = await loadConversation(g.tenantId, id, g.scope, g.user)
  if (!conv) return NextResponse.json({ success: false, error: 'Conversa não encontrada.' }, { status: 404 })
  // Conversa de outro vendedor: só gestor responde.
  if (conv.assignedToUserId && conv.assignedToUserId !== g.user.id && g.scope === 'own') {
    return NextResponse.json({ success: false, error: 'Esta conversa é de outro vendedor.' }, { status: 403 })
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string }
  const r = await sendConversationReply(g.tenantId, conv, String(body.text ?? ''), g.user)
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status })
  return NextResponse.json({ success: true, data: { messageId: r.messageId } })
}
