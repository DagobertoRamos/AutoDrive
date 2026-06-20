// =============================================================================
// POST /api/pendencies/[id]/comment — Adicionar comentário interno à pendência
// GET  /api/pendencies/[id]/comment — Listar comentários
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const schema = z.object({
  content:  z.string().min(1, 'Comentário não pode estar vazio').max(2000),
  internal: z.boolean().optional().default(false),
})

export async function GET(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const { id } = params

    const pendency = await prisma.pendency.findFirst({
      where: {
        id,
        ...(session.user.role !== 'MASTER' && session.user.tenantId
          ? { tenantId: session.user.tenantId }
          : {}),
      },
      select: { id: true },
    })

    if (!pendency) {
      return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })
    }

    const comments = await prisma.pendencyComment.findMany({
      where: { pendencyId: id },
      include: {
        user: { select: { id: true, name: true, role: true, image: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ success: true, data: comments })
  } catch (err) {
    console.error('[GET /api/pendencies/[id]/comment]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

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

    const { content, internal } = schema.parse(await req.json())
    const { id }               = params

    const pendency = await prisma.pendency.findFirst({
      where: {
        id,
        ...(session.user.role !== 'MASTER' && session.user.tenantId
          ? { tenantId: session.user.tenantId }
          : {}),
      },
      select: { id: true, tenantId: true, assignedUserId: true, managerId: true },
    })

    if (!pendency) {
      return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })
    }

    const comment = await prisma.pendencyComment.create({
      data: {
        pendencyId: id,
        userId:     session.user.id,
        content,
        internal,
      },
      include: {
        user: { select: { id: true, name: true, role: true, image: true } },
      },
    })

    // Notifica o usuário designado se não for ele mesmo comentando
    if (pendency.assignedUserId && pendency.assignedUserId !== session.user.id && pendency.tenantId) {
      await prisma.notification.create({
        data: {
          userId:    pendency.assignedUserId,
          tenantId:  pendency.tenantId,
          type:      'RESPOSTA',
          title:     'Novo comentário na pendência',
          message:   `${session.user.name}: ${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`,
          actionUrl: `/pendencias/central?id=${id}`,
        },
      })
    }

    return NextResponse.json({ success: true, data: comment }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0]?.message }, { status: 400 })
    }
    console.error('[POST /api/pendencies/[id]/comment]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
