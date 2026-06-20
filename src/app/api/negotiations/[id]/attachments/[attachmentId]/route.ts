// =============================================================================
// DELETE /api/negotiations/[id]/attachments/[attachmentId]
// Remove um anexo da negociação (arquivo do storage + linha do banco).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { requireModule }        from '@/lib/permissions'
import { deleteDealAttachment } from '@/lib/negotiation/storage'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const runtime = 'nodejs'

export async function DELETE(
  _req: NextRequest,
  ctxArg: { params: { id: string; attachmentId: string } | Promise<{ id: string; attachmentId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations.manage') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  try {
    const att = await prisma.dealAttachment.findUnique({ where: { id: params.attachmentId } })
    if (!att || att.dealId !== params.id) {
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 })
    }
    if (session.user.tenantId && att.tenantId && att.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    await deleteDealAttachment(att.storageKey).catch(() => { /* ignore */ })
    await prisma.dealAttachment.delete({ where: { id: att.id } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
