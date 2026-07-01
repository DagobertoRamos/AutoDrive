// =============================================================================
// API: /api/pendencies/[id]/unresolved — AutoDrive
// Marca pendência como AGUARDANDO_RESPOSTA com motivo
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { canAccessPendencyScope, isDeletedPendencyReason } from '@/lib/pendencies/access'

const schema = z.object({
  reason: z.string().min(1, 'Informe o motivo'),
})

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const body   = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message }, { status: 400 })
    }
    const { reason } = parsed.data

    const pendency = await prisma.pendency.findUnique({
      where:   { id: params.id },
      include: {
        responsible: { select: { fullName: true, userId: true } },
        manager:     { select: { userId: true } },
      },
    })

    if (!pendency) {
      return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })
    }
    if (!canAccessPendencyScope(session.user, pendency)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }
    if (pendency.status === 'CANCELADA' || isDeletedPendencyReason(pendency.cancelReason)) {
      return NextResponse.json({ success: false, error: 'Pendência arquivada ou excluída não pode ser alterada.' }, { status: 409 })
    }

    await Promise.all([
      prisma.pendency.update({
        where: { id: params.id },
        data:  { status: 'AGUARDANDO_RESPOSTA' },
      }),
      prisma.pendencyStatusHistory.create({
        data: {
          pendencyId:      params.id,
          previousStatus:  pendency.status,
          newStatus:       'AGUARDANDO_RESPOSTA',
          changedByUserId: session.user.id,
          reason:          reason,
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
          afterData: { status: 'AGUARDANDO_RESPOSTA', reason },
        },
      }).catch(() => {}),
    ])

    // Notificar gerente
    if (pendency.manager?.userId) {
      await prisma.notification.create({
        data: {
          userId:    pendency.manager.userId,
          type:      'NOVA_PENDENCIA',
          title:     `${pendency.responsible.fullName} aguarda resposta do cliente`,
          message:   `Motivo: ${reason} | Cliente: ${pendency.customerName} | Placa: ${pendency.plate ?? '—'}`,
          actionUrl: `/pendencias/gerencia`,
        },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, message: 'Status atualizado para Aguardando Resposta.' })
  } catch (err) {
    console.error('[POST /api/pendencies/[id]/unresolved]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
