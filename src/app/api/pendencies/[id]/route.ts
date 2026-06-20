import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canActOn } from '@/lib/role-hierarchy'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const PENDENCY_INCLUDE = {
  responsible: { select: { id: true, fullName: true, shortName: true, whatsapp: true } },
  manager: { select: { id: true, fullName: true, whatsapp: true } },
  unit: { select: { id: true, name: true } },
  resolvedByUser: { select: { id: true, name: true } },
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
    select: { id: true, tenantId: true, assignedUserId: true, resolvedByUserId: true },
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

    return NextResponse.json({ success: true, data: pendency })
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

    const allowed = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE']
    if (!allowed.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const { pendency: target, targetRole } = await loadPendencyAndTargetRole(params.id)
    if (!target) return NextResponse.json({ success: false, error: 'Não encontrada' }, { status: 404 })

    if (!canActOn(session.user.role, targetRole)) {
      return NextResponse.json({ success: false, error: 'Sem permissão para cancelar esta pendência.' }, { status: 403 })
    }

    await prisma.pendency.update({
      where: { id: params.id },
      data: { status: 'CANCELADA' },
    })

    return NextResponse.json({ success: true, message: 'Pendência cancelada.' })
  } catch {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
