import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    const pendency = await prisma.pendency.findUnique({
      where: { id: params.id },
      include: PENDENCY_INCLUDE,
    })

    if (!pendency) return NextResponse.json({ success: false, error: 'Não encontrada' }, { status: 404 })

    return NextResponse.json({ success: true, data: pendency })
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const pendency = await prisma.pendency.update({
      where: { id: params.id },
      data: body,
      include: PENDENCY_INCLUDE,
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'UPDATE', entity: 'Pendency', entityId: params.id },
    })

    return NextResponse.json({ success: true, data: pendency })
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    const allowed = ['MASTER', 'ADM', 'GERENTE']
    if (!allowed.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    await prisma.pendency.update({
      where: { id: params.id },
      data: { status: 'CANCELADA' },
    })

    return NextResponse.json({ success: true, message: 'Pendência cancelada.' })
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
