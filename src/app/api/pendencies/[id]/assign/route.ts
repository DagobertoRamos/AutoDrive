// =============================================================================
// PATCH /api/pendencies/[id]/assign — Atribuir pendência a um usuário
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyPendency } from '@/services/notification.service'
import { canActOn } from '@/lib/role-hierarchy'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const schema = z.object({
  assignedUserId: z.string().min(1, 'Usuário obrigatório').nullable(),
  notes:          z.string().optional(),
})

const ALLOWED_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE']

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const { assignedUserId, notes } = schema.parse(await req.json())
    const { id } = params

    // Busca pendência garantindo escopo do tenant
    const pendency = await prisma.pendency.findFirst({
      where: {
        id,
        ...(session.user.role !== 'MASTER' && session.user.tenantId
          ? { tenantId: session.user.tenantId }
          : {}),
      },
      select: { id: true, tenantId: true, unitId: true, status: true, customerName: true, assignedUserId: true },
    })

    if (!pendency) {
      return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })
    }

    // Hierarquia: não pode atribuir a alguém igual ou acima
    if (assignedUserId) {
      const targetUser = await prisma.user.findUnique({
        where:  { id: assignedUserId },
        select: { role: true },
      })
      if (!canActOn(session.user.role, targetUser?.role ?? null)) {
        return NextResponse.json(
          { success: false, error: 'Sem permissão para atribuir a um usuário deste nível.' },
          { status: 403 },
        )
      }
    }

    const updated = await prisma.pendency.update({
      where: { id },
      data:  {
        assignedUserId,
        status: pendency.status === 'ABERTA' ? 'EM_ANDAMENTO' : pendency.status,
        updatedAt: new Date(),
      },
    })

    // Histórico de status se mudou
    if (pendency.status === 'ABERTA') {
      await prisma.pendencyStatusHistory.create({
        data: {
          pendencyId:     id,
          previousStatus: 'ABERTA',
          newStatus:      'EM_ANDAMENTO',
          changedByUserId: session.user.id,
          reason:         notes ?? 'Pendência atribuída a usuário',
        },
      })
    }

    // Notifica o usuário atribuído
    if (assignedUserId) {
      await notifyPendency({
        pendencyId:  id,
        tenantId:    pendency.tenantId ?? '',
        unitId:      pendency.unitId,
        type:        'NOVA_PENDENCIA',
        title:       'Pendência atribuída a você',
        message:     `Você foi designado para tratar: ${pendency.customerName}`,
        notifyRoles: [],
      })

      // Notifica diretamente o usuário atribuído
      if (pendency.tenantId) {
        await prisma.notification.create({
          data: {
            userId:    assignedUserId,
            tenantId:  pendency.tenantId,
            type:      'NOVA_PENDENCIA',
            title:     'Pendência atribuída a você',
            message:   `Você foi designado para tratar: ${pendency.customerName}`,
            actionUrl: `/pendencias/central?id=${id}`,
          },
        })
      }
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0]?.message }, { status: 400 })
    }
    console.error('[PATCH /api/pendencies/[id]/assign]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
