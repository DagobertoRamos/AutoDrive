// =============================================================================
// POST /api/pendencies/penalties/[id]/remove — gestor remove uma penalidade com
// JUSTIFICATIVA obrigatória. Registra na timeline e avisa o vendedor. Gestor+.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { isPendencyManagerPlus } from '@/lib/pendencies/access'
import { logPendencyEvent, PENDENCY_EVENT } from '@/lib/pendencies/events'

const schema = z.object({ reason: z.string().min(5, 'Justifique a remoção (mín. 5 caracteres).') })

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
  if (!isPendencyManagerPlus(session.user.role)) return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message }, { status: 400 })

  const penalty = await prisma.pendencyPenalty.findFirst({
    where: { id, ...(session.user.role !== 'MASTER' && session.user.tenantId ? { tenantId: session.user.tenantId } : {}) },
    select: { id: true, tenantId: true, pendencyId: true, sellerUserId: true, active: true },
  }).catch(() => null)
  if (!penalty) return NextResponse.json({ success: false, error: 'Penalidade não encontrada' }, { status: 404 })
  if (!penalty.active) return NextResponse.json({ success: false, error: 'Penalidade já removida' }, { status: 409 })

  await prisma.pendencyPenalty.update({ where: { id }, data: { active: false, removedByUserId: session.user.id, removedReason: parsed.data.reason, removedAt: new Date() } })

  if (penalty.pendencyId) {
    await logPendencyEvent({ tenantId: penalty.tenantId, pendencyId: penalty.pendencyId, type: PENDENCY_EVENT.PENALTY_REMOVED, authorId: session.user.id, authorName: session.user.name, content: parsed.data.reason })
  }
  await prisma.notification.create({ data: { userId: penalty.sellerUserId, tenantId: penalty.tenantId ?? undefined, type: 'PENDENCIA_CRITICA', title: '✅ Penalidade removida', message: `Sua penalidade foi removida pelo gestor. Motivo: ${parsed.data.reason}` } }).catch(() => {})

  return NextResponse.json({ success: true })
}
