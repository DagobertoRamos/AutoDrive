// =============================================================================
// DELETE /api/evaluations/[id]/attachments/[attachmentId]
// Remove anexo (DB + storage). Apenas gerência+.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canDeleteAttachment }  from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'
import { deleteAttachment }     from '@/lib/evaluation/storage'

export const runtime = 'nodejs'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canDeleteAttachment(user, ctx))
      return NextResponse.json({ error: 'Sem permissão para excluir anexo' }, { status: 403 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const att: any = await (prisma as any).evaluationAttachment.findUnique({
      where: { id: params.attachmentId },
    })
    if (!att || att.evaluationId !== params.id)
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).evaluationAttachment.delete({ where: { id: params.attachmentId } })
    await deleteAttachment(att.storageKey)

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      itemId: att.itemId,
      serviceId: att.serviceId,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'REMOVE_ATTACHMENT',
      oldValue: { fileName: att.fileName, category: att.category, section: att.section },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
