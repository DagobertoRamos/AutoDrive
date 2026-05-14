// =============================================================================
// API: /api/communication/templates — AutoDrive
// Templates de mensagem WhatsApp para disparos automáticos e manuais
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const createSchema = z.object({
  name:        z.string().min(1, 'Nome obrigatório').max(100),
  content:     z.string().min(1, 'Conteúdo obrigatório').max(4000),
  description: z.string().optional(),
  active:      z.boolean().default(true),
})

// ── GET — lista templates ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'communication')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const templates = await prisma.whatsappTemplate.findMany({
      orderBy: { name: 'asc' },
    })

    // Mapear para formato esperado pelo frontend (content = bodyText)
    const data = templates.map((t) => ({
      ...t,
      content: t.bodyText ?? '',
    }))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/communication/templates]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── POST — cria template ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'communication.templates')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { name, content, description, active } = parsed.data

    // templateName é gerado a partir do name (campo obrigatório no schema)
    const templateName = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

    const template = await prisma.whatsappTemplate.create({
      data: {
        name,
        templateName,
        bodyText:    content,
        description: description ?? null,
        active,
        variables:   [],
      },
    })

    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'CREATE',
        entity:   'WhatsappTemplate',
        entityId: template.id,
        afterData:{ name: template.name },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: { ...template, content: template.bodyText ?? '' } }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/communication/templates]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
