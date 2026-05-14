// =============================================================================
// API: /api/communication/templates/[id] — AutoDrive
// Edição e exclusão de templates WhatsApp
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const updateSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  content:     z.string().min(1).max(4000).optional(),
  description: z.string().optional(),
  active:      z.boolean().optional(),
})

// ── PATCH — atualiza template ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'communication.templates')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { name, content, description, active } = parsed.data

    const updateData: Record<string, unknown> = {}
    if (name        !== undefined) {
      updateData.name         = name
      updateData.templateName = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    }
    if (content     !== undefined) updateData.bodyText     = content
    if (description !== undefined) updateData.description  = description
    if (active      !== undefined) updateData.active       = active

    const template = await prisma.whatsappTemplate.update({
      where: { id: params.id },
      data:  updateData as any,
    })

    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'UPDATE',
        entity:   'WhatsappTemplate',
        entityId: template.id,
        afterData:{ name: template.name, active: template.active },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: { ...template, content: template.bodyText ?? '' } })
  } catch (err) {
    console.error('[PATCH /api/communication/templates/[id]]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── DELETE — remove template ──────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'communication.templates')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    await prisma.whatsappTemplate.delete({ where: { id: params.id } })

    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'DELETE',
        entity:   'WhatsappTemplate',
        entityId: params.id,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/communication/templates/[id]]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
