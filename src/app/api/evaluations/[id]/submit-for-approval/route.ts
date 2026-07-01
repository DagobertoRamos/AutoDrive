// =============================================================================
// POST /api/evaluations/[id]/submit-for-approval
//
// Avaliador/vendedor envia a avaliação para o gerente precificar e liberar.
// - Valida foto obrigatória por seção (mínimo 1 FOTO_SECAO ou FOTO em cada
//   seção INTERIOR/FRENTE/DIREITA/TRASEIRA/ESQUERDA/TEST_DRIVE).
// - Marca status='AGUARDANDO_APROVACAO' + approvalRequestedAt/ById.
// - Notifica gerentes (in-app sempre; email/whatsapp best-effort).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canSubmitForApproval }  from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'
import { notifyByRole }         from '@/services/notification.service'

const REQUIRED_SECTIONS = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE'] as const

export async function POST(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canSubmitForApproval(user, ctx)) {
      return NextResponse.json({ error: 'Sem permissão para enviar para aprovação.' }, { status: 403 })
    }

    // Valida que cada seção obrigatória tenha ao menos 1 foto.
     
    const atts: Array<{ section: string | null; category: string | null; fileType: string }> =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).evaluationAttachment.findMany({
        where: { evaluationId: params.id, fileType: 'image' },
        select: { section: true, category: true, fileType: true },
      })

    const present = new Set<string>()
    for (const a of atts) if (a.section) present.add(a.section)
    const missing = REQUIRED_SECTIONS.filter((s) => !present.has(s))
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Foto obrigatória ausente nas seções: ${missing.join(', ')}. Envie ao menos 1 foto em cada seção antes de enviar para aprovação.`,
        missingSections: missing,
      }, { status: 400 })
    }

    const ev = await prisma.vehicleEvaluation.findUnique({
      where: { id: params.id },
      select: { plate: true, brand: true, model: true, tenantId: true },
    })

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: 'AGUARDANDO_APROVACAO' as any,
        approvalRequestedAt:   new Date(),
        approvalRequestedById: session.user.id,
      },
    })

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'SUBMIT_FOR_APPROVAL',
      oldValue: { status: ctx.status },
      newValue: { status: 'AGUARDANDO_APROVACAO' },
    }).catch(() => {})

    // Notifica gerentes — in-app sempre; email/whatsapp delegados ao serviço
    // (hoje placeholders mas estrutura pronta).
    if (ctx.tenantId) {
      const title = 'Nova avaliação para aprovar'
      const desc  = [ev?.plate, ev?.brand, ev?.model].filter(Boolean).join(' • ') || 'Avaliação'
      await notifyByRole({
        tenantId: ctx.tenantId,
        roles:    ['GERENTE', 'GERENTE_GERAL', 'ADM'],
        unitId:   ctx.unitId ?? undefined,
        type:     'SISTEMA',
        title,
        message:  `${desc} aguardando precificação e liberação.`,
        actionUrl: `/estoque/avaliacao/${params.id}/inspecao`,
        metadata:  { evaluationId: params.id },
        channels:  ['APP_WEB', 'APP_MOBILE', 'PUSH', 'EMAIL', 'WHATSAPP'],
      }).catch((e) => { console.error('[submit-for-approval] notify failed', e) })
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
