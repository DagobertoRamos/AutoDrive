// =============================================================================
// /api/negotiations/[id]/documents/[documentId]
//   GET    → detalhe (HTML renderizado)
//   PATCH  → marca como assinado / atualiza signedFileUrl / muda status
//   DELETE → remove documento
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { requireModule }        from '@/lib/permissions'

const VALID_STATUS = new Set(['RASCUNHO', 'GERADO', 'ASSINADO', 'ARQUIVADO'])

export async function GET(_req: NextRequest, ctxArg: { params: { id: string; documentId: string } | Promise<{ id: string; documentId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  const doc = await prisma.dealDocument.findUnique({ where: { id: params.documentId } })
  if (!doc || doc.dealId !== params.id) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (session.user.tenantId && doc.tenantId && doc.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  return NextResponse.json({ data: doc })
}

export async function PATCH(req: NextRequest, ctxArg: { params: { id: string; documentId: string } | Promise<{ id: string; documentId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations.manage') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const doc = await prisma.dealDocument.findUnique({ where: { id: params.documentId } })
    if (!doc || doc.dealId !== params.id) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
    if (session.user.tenantId && doc.tenantId && doc.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await req.json()
    const status = body?.status ? String(body.status).toUpperCase() : undefined
    if (status && !VALID_STATUS.has(status)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }

    const data = await prisma.dealDocument.update({
      where: { id: doc.id },
      data: {
        name:          body?.name          ?? doc.name,
        bodyHtml:      body?.bodyHtml      ?? doc.bodyHtml,
        signedFileUrl: body?.signedFileUrl ?? doc.signedFileUrl,
        signedAt:      body?.signedFileUrl && !doc.signedAt ? new Date() : doc.signedAt,
        signedBy:      body?.signedBy      ?? doc.signedBy,
        status:        (status ?? doc.status) as any,
      },
    })
    return NextResponse.json({ data })
  } catch (err) { return handlePrismaError(err) }
}

export async function DELETE(_req: NextRequest, ctxArg: { params: { id: string; documentId: string } | Promise<{ id: string; documentId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations.manage') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const doc = await prisma.dealDocument.findUnique({ where: { id: params.documentId } })
    if (!doc || doc.dealId !== params.id) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
    if (session.user.tenantId && doc.tenantId && doc.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }
    await prisma.dealDocument.delete({ where: { id: doc.id } })
    return NextResponse.json({ ok: true })
  } catch (err) { return handlePrismaError(err) }
}
