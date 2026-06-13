// =============================================================================
// /api/admin/document-templates/[id]
//   GET    → detalhe
//   PUT    → atualiza (MASTER global; lojista só do próprio tenant)
//   DELETE → soft-delete (active=false)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'

function canManage(role?: string): boolean {
  return role === 'MASTER' || role === 'ADM' || role === 'GERENTE_GERAL'
}

async function loadAccessible(id: string, tenantId: string | null, role: string) {
  const tpl = await prisma.documentTemplate.findUnique({ where: { id } })
  if (!tpl) return null
  if (role !== 'MASTER') {
    // não-MASTER só vê seu tenant ou globais (e só pode editar do próprio tenant)
    if (tpl.tenantId !== tenantId && tpl.tenantId !== null) return null
  }
  return tpl
}

export async function GET(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const tpl = await loadAccessible(params.id, session.user.tenantId ?? null, session.user.role)
    if (!tpl) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    return NextResponse.json({ data: tpl })
  } catch (err) { return handlePrismaError(err) }
}

export async function PUT(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  try {
    const tpl = await loadAccessible(params.id, session.user.tenantId ?? null, session.user.role)
    if (!tpl) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    // lojista não pode editar template global do MASTER
    if (session.user.role !== 'MASTER' && tpl.tenantId === null) {
      return NextResponse.json({ error: 'Template global — apenas MASTER pode editar' }, { status: 403 })
    }

    const body = await req.json()
    const data = await prisma.documentTemplate.update({
      where: { id: params.id },
      data: {
        name:        body?.name        ?? tpl.name,
        description: body?.description ?? tpl.description,
        bodyHtml:    body?.bodyHtml    ?? tpl.bodyHtml,
        variables:   body?.variables   ?? tpl.variables ?? undefined,
        active:      body?.active      ?? tpl.active,
        isDefault:   body?.isDefault   ?? tpl.isDefault,
      },
    })
    return NextResponse.json({ data })
  } catch (err) { return handlePrismaError(err) }
}

export async function DELETE(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  try {
    const tpl = await loadAccessible(params.id, session.user.tenantId ?? null, session.user.role)
    if (!tpl) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    if (session.user.role !== 'MASTER' && tpl.tenantId === null) {
      return NextResponse.json({ error: 'Template global — apenas MASTER pode remover' }, { status: 403 })
    }
    await prisma.documentTemplate.update({ where: { id: params.id }, data: { active: false } })
    return NextResponse.json({ ok: true })
  } catch (err) { return handlePrismaError(err) }
}
