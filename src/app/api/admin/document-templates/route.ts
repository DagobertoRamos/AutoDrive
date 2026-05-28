// =============================================================================
// /api/admin/document-templates
//   GET  → lista templates (MASTER vê todos; lojista vê os do tenant + globais).
//   POST → cria template (MASTER cria globais; ADM/GERENTE_GERAL cria do tenant).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'

const VALID_TYPES = new Set([
  'CONTRATO_COMPRA', 'CONTRATO_VENDA', 'CONTRATO_TROCA', 'CONTRATO_CONSIGNACAO',
  'PROCURACAO', 'RECIBO', 'TERMO_ENTREGA', 'TERMO_RESPONSABILIDADE', 'OUTRO',
])

function canManage(role?: string): boolean {
  return role === 'MASTER' || role === 'ADM' || role === 'GERENTE_GERAL'
}

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const type = req.nextUrl.searchParams.get('type') ?? undefined
    const where: any = {
      active: true,
      ...(type && VALID_TYPES.has(type) ? { type: type as any } : {}),
    }
    if (session.user.role !== 'MASTER') {
      where.OR = [{ tenantId: session.user.tenantId ?? null }, { tenantId: null }]
    }

    const data = await prisma.documentTemplate.findMany({
      where,
      orderBy: [{ tenantId: 'asc' }, { type: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({ data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para criar templates' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const type = String(body?.type ?? '').toUpperCase()
    const name = String(body?.name ?? '').trim()
    const bodyHtml = String(body?.bodyHtml ?? '')

    if (!VALID_TYPES.has(type)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    if (!bodyHtml) return NextResponse.json({ error: 'Conteúdo (bodyHtml) é obrigatório' }, { status: 400 })

    // MASTER pode criar global (tenantId=null); outros forçam tenantId do user
    const tenantId = session.user.role === 'MASTER'
      ? (body?.tenantId ?? null)
      : (session.user.tenantId ?? null)

    const data = await prisma.documentTemplate.create({
      data: {
        tenantId,
        type:        type as any,
        name,
        description: body?.description ?? null,
        bodyHtml,
        variables:   body?.variables ?? null,
        active:      body?.active ?? true,
        isDefault:   Boolean(body?.isDefault),
        createdById: session.user.id,
      },
    })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
