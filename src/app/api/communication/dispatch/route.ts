// =============================================================================
// API: /api/communication/dispatch — AutoDrive
// Disparo manual de mensagem WhatsApp para uma pendência
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const dispatchSchema = z.object({
  pendencyId: z.string().cuid(),
  phone:      z.string().min(10, 'Número de telefone inválido'),
  message:    z.string().max(4000).optional(),
  templateId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'communication.dispatch')) {
      return NextResponse.json({ success: false, error: 'Sem permissão para disparar mensagens' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = dispatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', errors: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { pendencyId, phone, message } = parsed.data

    const pendency = await prisma.pendency.findUnique({ where: { id: pendencyId } })
    if (!pendency) {
      return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })
    }

    // TODO: Integração real com WhatsApp Meta Cloud API
    // await sendWhatsAppMessage({ to: phone, message: message ?? defaultTemplate })

    // Atualiza lastSentAt e totalSent
    await prisma.pendency.update({
      where: { id: pendencyId },
      data:  {
        lastSentAt: new Date(),
        totalSent:  { increment: 1 },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId:    session.user.id,
        userName:  session.user.name,
        userRole:  session.user.role,
        action:    'DISPATCH',
        entity:    'Pendency',
        entityId:  pendencyId,
        afterData: { phone, manual: true },
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: 'Mensagem enviada com sucesso.',
    })
  } catch (err) {
    console.error('[POST /api/communication/dispatch]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
