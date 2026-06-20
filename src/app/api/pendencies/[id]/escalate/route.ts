// =============================================================================
// POST /api/pendencies/[id]/escalate — Escalonar pendência para nível superior
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const schema = z.object({
  reason: z.string().min(5, 'Motivo do escalonamento é obrigatório (mín. 5 caracteres)'),
})

const ALLOWED_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE']

export async function POST(
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

    const { reason } = schema.parse(await req.json())
    const { id }     = params

    const pendency = await prisma.pendency.findFirst({
      where: {
        id,
        ...(session.user.role !== 'MASTER' && session.user.tenantId
          ? { tenantId: session.user.tenantId }
          : {}),
      },
      select: {
        id: true, tenantId: true, unitId: true, status: true,
        customerName: true, priority: true, escalatedAt: true,
      },
    })

    if (!pendency) {
      return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })
    }

    if (pendency.escalatedAt) {
      return NextResponse.json(
        { success: false, error: 'Pendência já foi escalonada anteriormente' },
        { status: 409 },
      )
    }

    // Eleva a prioridade
    const priorityMap: Record<string, string> = {
      BAIXA: 'MEDIA',
      MEDIA: 'ALTA',
      ALTA:  'URGENTE',
      URGENTE: 'URGENTE',
    }
    const newPriority = priorityMap[pendency.priority] ?? 'URGENTE'

    const now = new Date()

    const updated = await prisma.pendency.update({
      where: { id },
      data: {
        priority:          newPriority as never,
        severity:          'CRITICAL',
        escalatedAt:       now,
        escalatedByUserId: session.user.id,
        status:            pendency.status === 'ABERTA' ? 'EM_ANDAMENTO' : pendency.status,
      },
    })

    // Registra no histórico
    await prisma.pendencyStatusHistory.create({
      data: {
        pendencyId:      id,
        previousStatus:  pendency.status,
        newStatus:       updated.status,
        changedByUserId: session.user.id,
        reason:          `ESCALONAMENTO: ${reason}`,
      },
    })

    // Notifica gerência/ADM
    if (pendency.tenantId) {
      const managers = await prisma.user.findMany({
        where: {
          tenantId: pendency.tenantId,
          role:     { in: ['GERENTE_GERAL', 'ADM'] as never[] },
          status:   'ATIVO',
          ...(pendency.unitId ? { unitId: pendency.unitId } : {}),
        },
        select: { id: true },
      })

      await Promise.all(
        managers.map((u) =>
          prisma.notification.create({
            data: {
              userId:    u.id,
              tenantId:  pendency.tenantId!,
              type:      'ESCALONAMENTO',
              title:     '⚠️ Pendência escalonada',
              message:   `${pendency.customerName}: ${reason}`,
              actionUrl: `/pendencias/central?id=${id}`,
            },
          }),
        ),
      )
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0]?.message }, { status: 400 })
    }
    console.error('[POST /api/pendencies/[id]/escalate]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
