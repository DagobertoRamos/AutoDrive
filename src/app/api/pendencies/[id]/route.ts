import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canActOn } from '@/lib/role-hierarchy'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import {
  canAccessPendencyScope,
  deletedPendencyReason,
  isDeletedPendencyReason,
  isPendencyGeneralManagerPlus,
} from '@/lib/pendencies/access'

const PENDENCY_INCLUDE = {
  responsible: { select: { id: true, fullName: true, shortName: true, whatsapp: true, userId: true } },
  manager: { select: { id: true, fullName: true, whatsapp: true, userId: true } },
  unit: { select: { id: true, name: true } },
  resolvedByUser: { select: { id: true, name: true } },
  assignedUser: { select: { id: true, name: true, role: true } },
  statusHistory: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
    include: { changedByUser: { select: { name: true } } },
  },
  messageReturns: {
    orderBy: { createdAt: 'desc' as const },
    take: 10,
    select: { id: true, profileName: true, messageBody: true, createdAt: true },
  },
} as const

// ── Helper: busca pendência e role do assignee para checagem de hierarquia ───
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
  const u = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { role: true },
  })
  return { pendency, targetRole: u?.role ?? null }
}

export async function GET(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const pendency = await prisma.pendency.findUnique({
      where: { id: params.id },
      include: PENDENCY_INCLUDE,
    })

    if (!pendency) return NextResponse.json({ success: false, error: 'Não encontrada' }, { status: 404 })
    if (isDeletedPendencyReason(pendency.cancelReason)) {
      return NextResponse.json({ success: false, error: 'Não encontrada' }, { status: 404 })
    }
    if (!canAccessPendencyScope(session.user, pendency)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    let complianceCase: Record<string, unknown> | null = null
    if (pendency.originModule === 'SELLER_QUEUE_COMPLIANCE' && pendency.originRecordId) {
      const flag = await prisma.sellerQueueFraudFlag.findUnique({
        where: { id: pendency.originRecordId },
        select: {
          id: true,
          kind: true,
          severity: true,
          status: true,
          detail: true,
          sellerId: true,
          actorId: true,
          attendanceId: true,
          arrivalId: true,
          reviewedAt: true,
          reviewedById: true,
          metadata: true,
          createdAt: true,
        },
      })

      if (flag) {
        const [sellerUser, actorUser, attendance, arrival, relatedPendencies] = await Promise.all([
          flag.sellerId ? prisma.user.findUnique({ where: { id: flag.sellerId }, select: { id: true, name: true } }) : Promise.resolve(null),
          flag.actorId ? prisma.user.findUnique({ where: { id: flag.actorId }, select: { id: true, name: true } }) : Promise.resolve(null),
          flag.attendanceId ? prisma.sellerQueueAttendance.findUnique({
            where: { id: flag.attendanceId },
            select: {
              id: true,
              status: true,
              result: true,
              visitType: true,
              calledAt: true,
              acceptedAt: true,
              startedAt: true,
              finishedAt: true,
              notes: true,
            },
          }) : Promise.resolve(null),
          flag.arrivalId ? prisma.sellerQueueCustomerArrival.findUnique({
            where: { id: flag.arrivalId },
            select: {
              id: true,
              customerName: true,
              customerPhone: true,
              recurring: true,
              status: true,
              createdAt: true,
            },
          }) : Promise.resolve(null),
          prisma.pendency.findMany({
            where: {
              tenantId: pendency.tenantId,
              originModule: 'SELLER_QUEUE_COMPLIANCE',
              originRecordId: flag.id,
            },
            select: { id: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
        ])

        complianceCase = {
          flagId: flag.id,
          kind: flag.kind,
          severity: flag.severity,
          status: flag.status,
          detail: flag.detail,
          createdAt: flag.createdAt,
          reviewedAt: flag.reviewedAt,
          metadata: flag.metadata,
          seller: sellerUser,
          actor: actorUser,
          attendance,
          arrival,
          relatedPendencies,
        }
      }
    }

    return NextResponse.json({ success: true, data: pendency, complianceCase })
  } catch {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const { pendency: target, targetRole } = await loadPendencyAndTargetRole(params.id)
    if (!target) return NextResponse.json({ success: false, error: 'Não encontrada' }, { status: 404 })
    if (!canAccessPendencyScope(session.user, target)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }
    if (target.status === 'CANCELADA' || isDeletedPendencyReason(target.cancelReason)) {
      return NextResponse.json({ success: false, error: 'Pendência arquivada ou excluída não pode ser editada.' }, { status: 409 })
    }

    if (!canActOn(session.user.role, targetRole)) {
      return NextResponse.json({ success: false, error: 'Sem permissão para alterar esta pendência.' }, { status: 403 })
    }

    const body = await req.json()
    const pendency = await prisma.pendency.update({
      where: { id: params.id },
      data: body,
      include: PENDENCY_INCLUDE,
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'UPDATE', entity: 'Pendency', entityId: params.id },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: pendency })
  } catch {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    if (!isPendencyGeneralManagerPlus(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const { pendency: target, targetRole } = await loadPendencyAndTargetRole(params.id)
    if (!target) return NextResponse.json({ success: false, error: 'Não encontrada' }, { status: 404 })
    if (!canAccessPendencyScope(session.user, target)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    if (!canActOn(session.user.role, targetRole)) {
      return NextResponse.json({ success: false, error: 'Sem permissão para excluir esta pendência.' }, { status: 403 })
    }

    if (!['FINALIZADA', 'CANCELADA'].includes(target.status)) {
      return NextResponse.json({ success: false, error: 'Somente pendências resolvidas ou arquivadas podem ser excluídas.' }, { status: 409 })
    }

    const body = await req.json().catch(() => ({})) as { reason?: string }
    const reason = body.reason?.trim() ?? ''
    if (reason.length < 5) {
      return NextResponse.json({ success: false, error: 'Informe o motivo da exclusão.' }, { status: 400 })
    }

    await prisma.pendency.update({
      where: { id: params.id },
      data: {
        status: 'CANCELADA',
        cancelReason: deletedPendencyReason(reason),
        automaticSend: false,
        nextSendAt: null,
      },
    })

    // Exclusão lógica: mantém o registro e a auditoria, mas esconde das listagens.
    await prisma.pendencyStatusHistory.create({
      data: {
        pendencyId: params.id,
        previousStatus: target.status,
        newStatus: 'CANCELADA',
        changedByUserId: session.user.id,
        reason: `Excluída: ${reason}`,
      },
    }).catch(() => {})
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action: 'DELETE',
        entity: 'Pendency',
        entityId: params.id,
        beforeData: { status: target.status, cancelReason: target.cancelReason },
        afterData: { status: 'CANCELADA', deleted: true, reason },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, message: 'Pendência excluída.' })
  } catch {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
