// =============================================================================
// API: /api/pendencies/[id]/resolve — AutoDrive
// Vendedor/responsável marca como resolvido → vai para CONFERÊNCIA do gerente
// (status AGUARDANDO_RESPOSTA + resolvedByUserId, lembretes pausados). Gerente+
// resolve direto (FINALIZADA). A aprovação/reprovação fica em /review.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function POST(_req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const pendency = await prisma.pendency.findUnique({
      where:   { id: params.id },
      include: {
        responsible: { select: { fullName: true } },
        manager:     { select: { id: true, userId: true } },
      },
    })

    if (!pendency) {
      return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })
    }

    if (pendency.status === 'FINALIZADA' || pendency.status === 'CANCELADA') {
      return NextResponse.json({ success: false, error: 'Pendência já está finalizada ou cancelada.' }, { status: 409 })
    }

    const now = new Date()
    // Gerente+ resolve direto; vendedor/responsável envia para conferência.
    const isManager = canAccessModule(session.user.role, 'pendencies.manage')
    const newStatus = isManager ? 'FINALIZADA' : 'AGUARDANDO_RESPOSTA'

    await Promise.all([
      prisma.pendency.update({
        where: { id: params.id },
        // resolvedByUserId marca "resolvido" (aguardando conferência quando não
        // é gerente); pausa os lembretes automáticos enquanto isso.
        data:  { status: newStatus, resolvedAt: now, resolvedByUserId: session.user.id, automaticSend: false },
      }),
      prisma.pendencyStatusHistory.create({
        data: {
          pendencyId:      params.id,
          previousStatus:  pendency.status,
          newStatus,
          changedByUserId: session.user.id,
        },
      }).catch(() => {}),
      prisma.auditLog.create({
        data: {
          userId:    session.user.id,
          userName:  session.user.name,
          userRole:  session.user.role,
          action:    'UPDATE',
          entity:    'Pendency',
          entityId:  params.id,
          beforeData:{ status: pendency.status },
          afterData: { status: newStatus, resolvedAt: now, review: isManager ? 'direto' : 'aguardando conferência' },
        },
      }).catch(() => {}),
    ])

    // Avisa o gerente responsável (para conferir/aprovar).
    if (pendency.manager?.userId) {
      await prisma.notification.create({
        data: {
          userId:    pendency.manager.userId,
          type:      isManager ? 'PENDENCIA_FINALIZADA' : 'PENDENCIA_RESOLVIDA',
          title:     isManager ? `${pendency.responsible.fullName} finalizou uma pendência` : `${pendency.responsible.fullName} marcou como resolvido — confira`,
          message:   `Cliente: ${pendency.customerName} | Placa: ${pendency.plate ?? '—'}`,
          actionUrl: `/pendencias/central`,
        },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, message: isManager ? 'Pendência finalizada.' : 'Enviada para conferência do gerente.', pendingReview: !isManager })
  } catch (err) {
    console.error('[POST /api/pendencies/[id]/resolve]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
