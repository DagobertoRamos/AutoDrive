// =============================================================================
// API: /api/settings/sheets — AutoDrive
// CRUD de configurações Google Sheets
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const createSchema = z.object({
  name:          z.string().min(2, 'Nome obrigatório'),
  spreadsheetId: z.string().min(1, 'ID da planilha obrigatório'),
  description:   z.string().optional(),
  active:        z.boolean().optional().default(true),
})

// ── GET — lista todas as configs com abas ────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'settings.sheets')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const configs = await prisma.googleSheetConfig.findMany({
      orderBy:  { createdAt: 'desc' },
      include: {
        tabs: {
          orderBy: { internalName: 'asc' },
        },
      },
    })

    return NextResponse.json({ success: true, data: configs })
  } catch (error) {
    console.error('[sheets:GET]', error)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── POST — cria nova configuração ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'settings.sheets')) {
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

    const config = await prisma.googleSheetConfig.create({
      data: parsed.data,
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'CREATE',
        entity:   'GoogleSheetConfig',
        entityId: config.id,
        afterData:{ name: config.name, spreadsheetId: config.spreadsheetId },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: config }, { status: 201 })
  } catch (error) {
    console.error('[sheets:POST]', error)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
