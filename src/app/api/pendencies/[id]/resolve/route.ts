// =============================================================================
// API: /api/pendencies/[id]/resolve — AutoDrive
// Marca uma pendência como FINALIZADA
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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

    await Promise.all([
      prisma.pendency.update({
        where: { id: params.id },
        data:  { status: 'FINALIZADA', resolvedAt: now, resolvedByUserId: session.user.id },
      }),
      prisma.pendencyStatusHistory.create({
        data: {
          pendencyId:      params.id,
          previousStatus:  pendency.status,
          newStatus:       'FINALIZADA',
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
          afterData: { status: 'FINALIZADA', resolvedAt: now },
        },
      }).catch(() => {}),
    ])

    // Notificar gerente responsável
    if (pendency.manager?.userId) {
      await prisma.notification.create({
        data: {
          userId:    pendency.manager.userId,
          type:      'PENDENCIA_FINALIZADA',
          title:     `${pendency.responsible.fullName} finalizou uma pendência`,
          message:   `Cliente: ${pendency.customerName} | Placa: ${pendency.plate ?? '—'}`,
          actionUrl: `/pendencias/gerencia`,
        },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, message: 'Pendência finalizada com sucesso.' })
  } catch (err) {
    console.error('[POST /api/pendencies/[id]/resolve]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
