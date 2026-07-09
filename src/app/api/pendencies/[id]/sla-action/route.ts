// =============================================================================
// POST /api/pendencies/[id]/sla-action — respostas do pop-up de SLA (Fase 3):
//   { action: 'commit',  committedDueDate, note? } → registra prazo comprometido
//   { action: 'defer',   reason }                  → adia o pop-up (limite maxDefer)
//   { action: 'shown',   kind }                    → registra pop-up exibido (auditoria/throttle)
//   { action: 'respond', note, committedDueDate? } → resposta à cobrança
// Só o RESPONSÁVEL (ou gestor+) da pendência. Grava tudo na timeline. Gate: pendencies.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'
import { logPendencyEvent, PENDENCY_EVENT } from '@/lib/pendencies/events'
import { loadTenantPendencySettings, DEFAULT_PENDENCY_SETTINGS } from '@/lib/pendencies/settings'
import { isPendencyManagerPlus } from '@/lib/pendencies/access'

const schema = z.object({
  action:           z.enum(['commit', 'defer', 'shown', 'respond']),
  committedDueDate: z.string().optional(),
  note:             z.string().optional(),
  reason:           z.string().optional(),
  kind:             z.enum(['commit', 'charge']).optional(),
})

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
  if (!canAccessModule(session.user.role, 'pendencies') && !canAccessModule(session.user.role, 'pendencies.central')) {
    return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Dados inválidos' }, { status: 400 })
  const body = parsed.data

  const pendency = await prisma.pendency.findFirst({
    where: { id, ...(session.user.role !== 'MASTER' && session.user.tenantId ? { tenantId: session.user.tenantId } : {}) },
    select: { id: true, tenantId: true, status: true, responsibleId: true },
  })
  if (!pendency) return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })

  // Autorização: o próprio responsável (mapeado do usuário) ou gestor+.
  if (!isPendencyManagerPlus(session.user.role)) {
    const seller = await prisma.seller.findFirst({ where: { userId: session.user.id }, select: { id: true } }).catch(() => null)
    if (!seller || seller.id !== pendency.responsibleId) {
      return NextResponse.json({ success: false, error: 'Só o responsável pode responder.' }, { status: 403 })
    }
  }

  const base = { tenantId: pendency.tenantId, pendencyId: id, authorId: session.user.id, authorName: session.user.name }

  try {
    if (body.action === 'shown') {
      await logPendencyEvent({ ...base, type: PENDENCY_EVENT.POPUP_SHOWN, content: body.kind ?? 'commit' })
      return NextResponse.json({ success: true })
    }

    if (body.action === 'defer') {
      const reason = (body.reason ?? '').trim()
      if (reason.length < 3) return NextResponse.json({ success: false, error: 'Justifique o adiamento.' }, { status: 400 })
      const config = pendency.tenantId ? await loadTenantPendencySettings(pendency.tenantId).catch(() => DEFAULT_PENDENCY_SETTINGS) : DEFAULT_PENDENCY_SETTINGS
      const deferCount = await prisma.pendencyEvent.count({ where: { pendencyId: id, type: PENDENCY_EVENT.POPUP_DISMISSED } }).catch(() => 0)
      if (deferCount >= config.slaEngine.maxDefer) {
        return NextResponse.json({ success: false, error: 'Limite de adiamentos atingido. Informe um prazo.' }, { status: 409 })
      }
      await logPendencyEvent({ ...base, type: PENDENCY_EVENT.POPUP_DISMISSED, content: reason })
      return NextResponse.json({ success: true })
    }

    // commit | respond — ambos podem trazer um prazo comprometido.
    const committed = body.committedDueDate ? new Date(body.committedDueDate) : null
    if (body.action === 'commit') {
      if (!committed || Number.isNaN(committed.getTime())) return NextResponse.json({ success: false, error: 'Informe um prazo válido.' }, { status: 400 })
      await logPendencyEvent({ ...base, type: PENDENCY_EVENT.COMMITMENT, newDueDate: committed, content: body.note?.trim() || null })
      // Ao comprometer prazo, sai de ABERTA para EM_ANDAMENTO (com registro).
      if (pendency.status === 'ABERTA') {
        await prisma.pendency.update({ where: { id }, data: { status: 'EM_ANDAMENTO' } }).catch(() => {})
        await prisma.pendencyStatusHistory.create({ data: { pendencyId: id, previousStatus: 'ABERTA', newStatus: 'EM_ANDAMENTO', changedByUserId: session.user.id, reason: 'Prazo comprometido pelo responsável' } }).catch(() => {})
        await logPendencyEvent({ ...base, type: PENDENCY_EVENT.STATUS_CHANGED, prevStatus: 'ABERTA', newStatus: 'EM_ANDAMENTO' })
      }
      return NextResponse.json({ success: true })
    }

    // respond (resposta à cobrança) — exige justificativa; prazo é opcional.
    const note = (body.note ?? '').trim()
    if (note.length < 3) return NextResponse.json({ success: false, error: 'Explique o que aconteceu.' }, { status: 400 })
    await logPendencyEvent({ ...base, type: PENDENCY_EVENT.RESPONSE, content: note })
    if (committed && !Number.isNaN(committed.getTime())) {
      await logPendencyEvent({ ...base, type: PENDENCY_EVENT.COMMITMENT, newDueDate: committed, content: 'novo prazo após cobrança' })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
