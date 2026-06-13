// =============================================================================
// API: /api/settings/sheets/[id] — AutoDrive
// Edição e exclusão de configuração de planilha Google Sheets
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const updateSchema = z.object({
  name:          z.string().min(2, 'Nome obrigatório').optional(),
  spreadsheetId: z.string().min(1, 'ID da planilha obrigatório').optional(),
  description:   z.string().optional(),
  active:        z.boolean().optional(),
})

// ── PUT — atualiza configuração ───────────────────────────────────────────────
export async function PUT(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings.sheets')) {
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

    const existing = await prisma.googleSheetConfig.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Planilha não encontrada' }, { status: 404 })
    }

    const config = await prisma.googleSheetConfig.update({
      where: { id: params.id },
      data:  parsed.data,
    })

    await prisma.auditLog.create({
      data: {
        userId:     session.user.id,
        userName:   session.user.name,
        userRole:   session.user.role,
        action:     'UPDATE',
        entity:     'GoogleSheetConfig',
        entityId:   config.id,
        beforeData: { name: existing.name, spreadsheetId: existing.spreadsheetId },
        afterData:  { name: config.name,   spreadsheetId: config.spreadsheetId },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: config })
  } catch (err) {
    console.error('[PUT /api/settings/sheets/[id]]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── DELETE — remove configuração ──────────────────────────────────────────────
export async function DELETE(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings.sheets')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const existing = await prisma.googleSheetConfig.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Planilha não encontrada' }, { status: 404 })
    }

    // Cascade: tabs são removidas pela relação onDelete: Cascade no schema
    await prisma.googleSheetConfig.delete({ where: { id: params.id } })

    await prisma.auditLog.create({
      data: {
        userId:     session.user.id,
        userName:   session.user.name,
        userRole:   session.user.role,
        action:     'DELETE',
        entity:     'GoogleSheetConfig',
        entityId:   params.id,
        beforeData: { name: existing.name, spreadsheetId: existing.spreadsheetId },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/settings/sheets/[id]]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
