// =============================================================================
// API: /api/settings/sheets/tabs — AutoDrive
// CRUD de abas do Google Sheets
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

const createTabSchema = z.object({
  configId:     z.string().cuid('Config ID inválido'),
  internalName: z.string().min(2, 'Nome interno obrigatório'),
  sheetName:    z.string().min(1, 'Nome da aba na planilha obrigatório'),
  tabType:      z.enum(TAB_TYPES).default('PERSONALIZADO'),
  description:  z.string().optional(),
  headerRow:    z.number().int().min(1).default(1),
  active:       z.boolean().optional().default(true),
})

// ── GET — lista abas de uma config ───────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings.sheets')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const configId = searchParams.get('configId')

    const tabs = await prisma.googleSheetTab.findMany({
      where:   configId ? { configId } : undefined,
      orderBy: { internalName: 'asc' },
      include: { columnMaps: { where: { active: true }, orderBy: { columnLetter: 'asc' } } },
    })

    return NextResponse.json({ success: true, data: tabs })
  } catch (error) {
    console.error('[sheets/tabs:GET]', error)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

// ── POST — cria nova aba ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings.sheets')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const body   = await req.json()
    const parsed = createTabSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // Verifica se a config existe
    const config = await prisma.googleSheetConfig.findUnique({ where: { id: parsed.data.configId } })
    if (!config) {
      return NextResponse.json({ success: false, error: 'Planilha não encontrada' }, { status: 404 })
    }

    const tab = await prisma.googleSheetTab.create({ data: parsed.data })

    await prisma.auditLog.create({
      data: {
        userId:    session.user.id,
        userName:  session.user.name,
        userRole:  session.user.role,
        action:    'CREATE',
        entity:    'GoogleSheetTab',
        entityId:  tab.id,
        afterData: { internalName: tab.internalName, sheetName: tab.sheetName },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: tab }, { status: 201 })
  } catch (error) {
    console.error('[sheets/tabs:POST]', error)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
