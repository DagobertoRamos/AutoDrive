// =============================================================================
// API: /api/pendencies/[id]/review — conferência do gerente.
// Body: { action: 'approve' | 'reject', reason? }
//   approve → FINALIZADA (encerra; para de cobrar).
//   reject  → REATIVADA (volta pro responsável) + motivo obrigatório + reativa
//             os lembretes (automaticSend). Gate: pendencies.manage (gerente+).
// =============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { canAccessPendencyScope, isDeletedPendencyReason } from '@/lib/pendencies/access'

const schema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
})

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'pendencies.manage')) {
      return NextResponse.json({ success: false, error: 'Apenas a gerência pode conferir a resolução.' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const parsed = schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Dados inválidos.' }, { status: 400 })
    const { action } = parsed.data
    const reason = parsed.data.reason?.trim() ?? ''
    if (action === 'reject' && !reason) {
      return NextResponse.json({ success: false, error: 'Informe o motivo da reprovação.' }, { status: 400 })
    }

    const pendency = await prisma.pendency.findUnique({
      where: { id: params.id },
      include: {
        responsible: { select: { fullName: true, userId: true } },
        manager: { select: { userId: true } },
      },
    })
    if (!pendency) return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })
    if (!canAccessPendencyScope(session.user, pendency)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }
    if (pendency.status === 'CANCELADA' || isDeletedPendencyReason(pendency.cancelReason)) {
      return NextResponse.json({ success: false, error: 'Pendência arquivada ou excluída não pode ser conferida.' }, { status: 409 })
    }

    const now = new Date()
    const newStatus = action === 'approve' ? 'FINALIZADA' : 'REATIVADA'

    await Promise.all([
      prisma.pendency.update({
        where: { id: params.id },
        data: action === 'approve'
          ? { status: 'FINALIZADA', resolvedAt: pendency.resolvedAt ?? now }
          // reprovado: volta pro responsável e RETOMA os lembretes.
          : { status: 'REATIVADA', resolvedByUserId: null, resolvedAt: null, automaticSend: true, nextSendAt: now },
      }),
      prisma.pendencyStatusHistory.create({
        data: { pendencyId: params.id, previousStatus: pendency.status, newStatus, changedByUserId: session.user.id, reason: action === 'reject' ? reason : null },
      }).catch(() => {}),
      prisma.auditLog.create({
        data: { userId: session.user.id, userName: session.user.name, userRole: session.user.role, action: 'UPDATE', entity: 'Pendency', entityId: params.id, beforeData: { status: pendency.status }, afterData: { status: newStatus, review: action, reason: reason || undefined } },
      }).catch(() => {}),
    ])

    // Avisa o responsável do resultado.
    if (pendency.responsible?.userId) {
      await prisma.notification.create({
        data: {
          userId: pendency.responsible.userId,
          type: action === 'approve' ? 'PENDENCIA_FINALIZADA' : 'PENDENCIA_NAO_RESOLVIDA',
          title: action === 'approve' ? 'Resolução aprovada ✅' : 'Resolução reprovada — refaça',
          message: action === 'approve' ? `Pendência de ${pendency.customerName} foi aprovada e encerrada.` : `Pendência de ${pendency.customerName} reprovada. Motivo: ${reason}`,
          actionUrl: '/pendencias/central',
        },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, message: action === 'approve' ? 'Resolução aprovada.' : 'Reprovada — devolvida ao responsável.' })
  } catch (err) {
    console.error('[POST /api/pendencies/[id]/review]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
