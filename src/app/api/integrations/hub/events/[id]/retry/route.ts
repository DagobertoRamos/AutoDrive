// POST /api/integrations/hub/events/[id]/retry — reprocessa um evento que falhou.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hubGuard } from '@/lib/integrations/hub/guard'
import { processInboxEvent, requeueEvent } from '@/lib/integrations/inbox'
import { handlerFor } from '@/lib/integrations/inbox-dispatch'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await hubGuard(req)
  if (!g.ok) return g.response
  const { id } = await params
  const row = await prisma.webhookInbox.findFirst({ where: { id, tenantId: g.tenantId }, select: { id: true, provider: true } })
  if (!row) return NextResponse.json({ success: false, error: 'Evento não encontrado.' }, { status: 404 })
  if (!await requeueEvent(id, g.tenantId)) return NextResponse.json({ success: false, error: 'Este evento não está com falha.' }, { status: 409 })
  const handler = await handlerFor(row.provider)
  const r = handler ? await processInboxEvent(id, handler) : { status: 'FAILED', error: 'Sem processador.' }
  return NextResponse.json({ success: r.status === 'PROCESSED', data: r }, { status: r.status === 'PROCESSED' ? 200 : 422 })
}
