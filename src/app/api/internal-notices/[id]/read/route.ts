// =============================================================================
// POST /api/internal-notices/[id]/read — Marcar aviso como lido/dispensado/confirmado
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  dismissed: z.boolean().optional().default(false),
  confirmed: z.boolean().optional().default(false),
})

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    const { dismissed, confirmed } = schema.parse(await req.json())

    // Upsert — cria ou atualiza o registro de leitura
    await prisma.internalNoticeRead.upsert({
      where:  { noticeId_userId: { noticeId: params.id, userId: session.user.id } },
      create: {
        noticeId:  params.id,
        userId:    session.user.id,
        dismissed,
        confirmed,
      },
      update: {
        dismissed: dismissed || undefined,
        confirmed: confirmed || undefined,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0]?.message }, { status: 400 })
    }
    console.error('[POST /api/internal-notices/[id]/read]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
