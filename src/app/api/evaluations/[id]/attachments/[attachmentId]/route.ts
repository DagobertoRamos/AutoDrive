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
  ctxArg: { params: { id: string; attachmentId: string } | Promise<{ id: string; attachmentId: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const params = await Promise.resolve(ctxArg.params)
  const evaluationId = params?.id
  const attachmentId = params?.attachmentId
  if (!evaluationId || !attachmentId) {
    return NextResponse.json({ error: 'Parâmetros ausentes na URL.' }, { status: 400 })
  }

  try {
    const ctx = await loadEvaluationContext(evaluationId)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canDeleteAttachment(user, ctx))
      return NextResponse.json({ error: 'Sem permissão para excluir anexo' }, { status: 403 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const att: any = await (prisma as any).evaluationAttachment.findUnique({
      where: { id: attachmentId },
    })
    if (!att || att.evaluationId !== evaluationId)
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).evaluationAttachment.delete({ where: { id: attachmentId } })
    await deleteAttachment(att.storageKey)

    // Action específica pra documentos oficiais (CRLV/Cautelar/ATPV-e/DUT-CRV)
    const cat = String(att.category ?? '').toUpperCase()
    const action = cat === 'CRLV'           ? 'DOCUMENT_CRLV_DELETED'
                 : cat === 'LAUDO_CAUTELAR' ? 'DOCUMENT_CAUTELAR_DELETED'
                 : cat === 'ATPV_E'         ? 'DOCUMENT_ATPV_E_DELETED'
                 : cat === 'DUT_CRV'        ? 'DOCUMENT_DUT_CRV_DELETED'
                 : 'REMOVE_ATTACHMENT'

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId,
      itemId: att.itemId,
      serviceId: att.serviceId,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action,
      oldValue: { fileName: att.fileName, category: att.category, section: att.section, attachmentId },
    })

    if (action !== 'REMOVE_ATTACHMENT') {
      await prisma.auditLog.create({
        data: {
          userId:     session.user.id,
          tenantId:   ctx.tenantId ?? null,
          action,
          entity:     'EvaluationAttachment',
          entityId:   attachmentId,
          userName:   session.user.name ?? null,
          userRole:   session.user.role,
          status:     'SUCCESS',
          beforeData: {
            evaluationId, category: att.category, fileName: att.fileName,
          } as never,
        },
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[attachments DELETE] falha:', err instanceof Error ? err.message : err)
    }
    return handlePrismaError(err)
  }
}
