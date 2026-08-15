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
import { notifyByRole, notify } from '@/services/notification.service'
import { getEvaluationPending, parseOpcionais } from '@/lib/evaluation/rules'

// Marker persistido em evaluationNotes para guardar o vendedor atribuído sem
// migration de schema. Mesmo padrão do [Ano Modelo], [Opcionais], [APPLIES_TO].
const ASSIGNED_SELLER_RE = /^\s*\[ASSIGNED_SELLER\]\s*(\S+)\s*\r?\n?/m
function stripAssignedSeller(notes: string | null | undefined): string {
  return (notes ?? '').replace(ASSIGNED_SELLER_RE, '').trim()
}
function withAssignedSeller(sellerUserId: string, extra: string): string {
  const clean = stripAssignedSeller(extra)
  const line = `[ASSIGNED_SELLER] ${sellerUserId}`
  return clean ? `${line}\n${clean}` : line
}


export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Body opcional: { assignedSellerId? } — quando presente, persistimos o
  // userId do vendedor no evaluationNotes com marker e disparamos notificação
  // adicional para ele.
  const body = await req.json().catch(() => null) as { assignedSellerId?: string } | null
  const assignedSellerId = body?.assignedSellerId && typeof body.assignedSellerId === 'string' ? body.assignedSellerId.trim() : null

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canSubmitForApproval(user, ctx)) {
      return NextResponse.json({ error: 'Sem permissão para enviar para aprovação.' }, { status: 403 })
    }

    // ── Validação OBRIGATÓRIA no servidor ────────────────────────────────
    // Mesma regra do frontend (src/lib/evaluation/rules.ts): foto geral por
    // seção + itens/fotos declarados como obrigatórios no catálogo. O cliente
    // NUNCA decide sozinho que a avaliação está pronta.
    const evForRules = await prisma.vehicleEvaluation.findUnique({
      where:  { id: params.id },
      select: { evaluationNotes: true },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [dbItems, dbAttachments]: [any[], any[]] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).evaluationItem.findMany({
        where:  { evaluationId: params.id },
        select: { id: true, section: true, catalogKey: true, name: true, status: true },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).evaluationAttachment.findMany({
        where:  { evaluationId: params.id },
        select: { id: true, section: true, itemId: true, fileType: true, category: true },
      }),
    ])

    const pending = getEvaluationPending({
      items:       dbItems,
      attachments: dbAttachments,
      opcionais:   parseOpcionais(evForRules?.evaluationNotes ?? null),
    })

    if (pending.length > 0) {
      return NextResponse.json({
        code:    'REQUIRED_ITEMS_PENDING',
        message: 'Existem requisitos obrigatórios pendentes.',
        error:   `Existem ${pending.length} requisito(s) obrigatório(s) pendente(s). Volte às seções indicadas antes de enviar para aprovação.`,
        pending: pending.map((p) => ({
          sectionId:    p.sectionId,
          sectionLabel: p.sectionLabel,
          itemId:       p.itemId,
          catalogKey:   p.catalogKey,
          type:         p.type === 'SECTION_PHOTO' || p.type === 'ITEM_PHOTO' ? 'photo' : 'item',
          label:        p.label,
        })),
      }, { status: 422 })
    }

    const ev = await prisma.vehicleEvaluation.findUnique({
      where: { id: params.id },
      select: { plate: true, brand: true, model: true, tenantId: true, evaluationNotes: true },
    })

    // Se veio vendedor no body, valida que o userId corresponde a um Seller
    // ativo da unidade da avaliação (defesa em profundidade — o dropdown
    // do frontend já filtra, mas API não pode confiar no cliente).
    if (assignedSellerId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seller = await (prisma as any).seller.findFirst({
        where: {
          userId: assignedSellerId,
          active: true,
          ...(ctx.unitId ? { unitId: ctx.unitId } : {}),
        },
        select: { id: true, fullName: true, userId: true },
      })
      if (!seller) {
        return NextResponse.json({
          error: 'Vendedor selecionado não pertence à unidade da avaliação ou está inativo.',
        }, { status: 400 })
      }
    }

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: 'AGUARDANDO_APROVACAO' as any,
        approvalRequestedAt:   new Date(),
        approvalRequestedById: session.user.id,
        // Persiste o vendedor atribuído no notes (sem migration)
        ...(assignedSellerId ? { evaluationNotes: withAssignedSeller(assignedSellerId, ev?.evaluationNotes ?? '') } : {}),
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

      // Notifica também o vendedor atribuído (se houver) — para ele acompanhar
      // a negociação assim que o gerente precificar/liberar.
      if (assignedSellerId) {
        await notify({
          tenantId: ctx.tenantId,
          userId:   assignedSellerId,
          type:     'SISTEMA',
          title:    'Avaliação atribuída a você',
          message:  `Você é o vendedor responsável pela avaliação: ${desc}. Assim que o gerente liberar, você poderá dar sequência.`,
          actionUrl: `/estoque/avaliacao/${params.id}/inspecao`,
          metadata:  { evaluationId: params.id, role: 'ASSIGNED_SELLER' },
          channels:  ['APP_WEB', 'APP_MOBILE', 'PUSH'],
        }).catch((e) => { console.error('[submit-for-approval] notify seller failed', e) })
      }
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
