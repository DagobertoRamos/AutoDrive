// =============================================================================
// API: /api/settings/sheets/tabs/[id] — AutoDrive
// Edição e exclusão de abas do Google Sheets
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const TAB_TYPES = [
  'VENDAS','TROCAS','CLIENTES','VEICULOS','CONTRATOS','COMISSOES',
  'GARANTIAS','RETORNOS','PENDENCIAS','VENDEDORES','GERENTES','UNIDADES',
  'CONFIGURACOES','PERSONALIZADO',
] as const

const updateTabSchema = z.object({
  internalName: z.string().min(2).optional(),
  sheetName:    z.string().min(1).optional(),
  tabType:      z.enum(TAB_TYPES).optional(),
  description:  z.string().optional(),
  headerRow:    z.number().int().min(1).optional(),
  active:       z.boolean().optional(),
})

// ── PUT — atualiza aba ────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings.sheets')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = updateTabSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const existing = await prisma.googleSheetTab.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Aba não encontrada' }, { status: 404 })
    }

    const tab = await prisma.googleSheetTab.update({
      where: { id: params.id },
      data:  parsed.data as any,
    })

    await prisma.auditLog.create({
      data: {
        userId:     session.user.id,
        userName:   session.user.name,
        userRole:   session.user.role,
        action:     'UPDATE',
        entity:     'GoogleSheetTab',
        entityId:   tab.id,
        beforeData: { internalName: existing.internalName },
        afterData:  { internalName: tab.internalName },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: tab })
  } catch (err) {
    console.error('[PUT /api/settings/sheets/tabs/[id]]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── DELETE — remove aba ───────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings.sheets')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const existing = await prisma.googleSheetTab.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Aba não encontrada' }, { status: 404 })
    }

    await prisma.googleSheetTab.delete({ where: { id: params.id } })

    await prisma.auditLog.create({
      data: {
        userId:     session.user.id,
        userName:   session.user.name,
        userRole:   session.user.role,
        action:     'DELETE',
        entity:     'GoogleSheetTab',
        entityId:   params.id,
        beforeData: { internalName: existing.internalName, configId: existing.configId },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/settings/sheets/tabs/[id]]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
