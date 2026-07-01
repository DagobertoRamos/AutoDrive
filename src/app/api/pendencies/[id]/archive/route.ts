import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canActOn } from '@/lib/role-hierarchy'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { canAccessPendencyScope, isPendencyManagerPlus } from '@/lib/pendencies/access'

async function loadPendencyAndTargetRole(id: string) {
  const pendency = await prisma.pendency.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      unitId: true,
      status: true,
      cancelReason: true,
      assignedUserId: true,
      resolvedByUserId: true,
      responsible: { select: { userId: true } },
      manager: { select: { userId: true } },
    },
  })
  if (!pendency) return { pendency: null, targetRole: null }
  const targetUserId = pendency.assignedUserId ?? pendency.resolvedByUserId
  if (!targetUserId) return { pendency, targetRole: null }
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } })
  return { pendency, targetRole: target?.role ?? null }
}

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!isPendencyManagerPlus(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Apenas gerente ou superior pode arquivar.' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const { pendency, targetRole } = await loadPendencyAndTargetRole(params.id)
    if (!pendency) return NextResponse.json({ success: false, error: 'Pendência não encontrada.' }, { status: 404 })
    if (!canAccessPendencyScope(session.user, pendency)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }
    if (!canActOn(session.user.role, targetRole)) {
      return NextResponse.json({ success: false, error: 'Sem permissão para arquivar esta pendência.' }, { status: 403 })
    }
    if (pendency.status !== 'FINALIZADA') {
      return NextResponse.json({ success: false, error: 'Somente pendências resolvidas podem ser arquivadas.' }, { status: 409 })
    }

    const body = await req.json().catch(() => ({})) as { reason?: string }
    const reason = body.reason?.trim() || 'Arquivada após resolução.'

    await Promise.all([
      prisma.pendency.update({
        where: { id: params.id },
        data: {
          status: 'CANCELADA',
          cancelReason: reason,
          automaticSend: false,
          nextSendAt: null,
        },
      }),
      prisma.pendencyStatusHistory.create({
        data: {
          pendencyId: params.id,
          previousStatus: pendency.status,
          newStatus: 'CANCELADA',
          changedByUserId: session.user.id,
          reason: `Arquivada: ${reason}`,
        },
      }).catch(() => {}),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          userName: session.user.name,
          userRole: session.user.role,
          action: 'ARCHIVE',
          entity: 'Pendency',
          entityId: params.id,
          beforeData: { status: pendency.status, cancelReason: pendency.cancelReason },
          afterData: { status: 'CANCELADA', archived: true, reason },
        },
      }).catch(() => {}),
    ])

    return NextResponse.json({ success: true, message: 'Pendência arquivada.' })
  } catch (err) {
    console.error('[POST /api/pendencies/[id]/archive]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
