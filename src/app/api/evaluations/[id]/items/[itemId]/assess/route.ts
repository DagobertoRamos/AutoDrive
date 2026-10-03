// =============================================================================
// POST /api/evaluations/[id]/items/[itemId]/assess — avaliação rápida do item.
//   { result: 'OK' | 'REPARO' | 'NA', repairKey?, notes?, appliesTo?: string[] }
// Exige foto do item (exceto "Não se aplica"). O valor do reparo vem da tabela
// da loja (Configurações de avaliação) — nunca do cliente. Substitui o serviço
// previsto do item e recalcula os totais.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { loadEvaluationContext, recalcTotals } from '@/lib/evaluation/service'
import { canEditEvaluation } from '@/lib/evaluation/permissions'
import { recordHistory } from '@/lib/evaluation/history'
import { serializeNotesWithAppliesTo } from '@/lib/evaluation/catalog'
import { loadRepairs } from '@/lib/evaluation/repair-prices'
import { repairTotal, repairsForSection } from '@/lib/evaluation/repair-prices-core'

const STATUS = { OK: 'CONFORME', REPARO: 'REPARO', NA: 'NA' } as const
const REPAIR_MARK = '[REPARO_TABELA]'

export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string; itemId: string }> }) {
  const params = await ctxArg.params
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canEditEvaluation(user, ctx)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const item = await prisma.evaluationItem.findUnique({ where: { id: params.itemId } })
    if (!item || item.evaluationId !== params.id) return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })

    const body = await req.json().catch(() => ({})) as { result?: string; repairKey?: string; notes?: string; appliesTo?: unknown }
    const result = String(body.result ?? '').toUpperCase() as keyof typeof STATUS
    if (!STATUS[result]) return NextResponse.json({ error: 'Escolha o resultado do item.' }, { status: 400 })

    if (result !== 'NA') {
      const photos = await prisma.evaluationAttachment.count({ where: { evaluationId: params.id, itemId: item.id } })
      if (!photos) return NextResponse.json({ error: 'Tire a foto do item.' }, { status: 400 })
    }

    const appliesTo = Array.isArray(body.appliesTo) ? body.appliesTo.map(String).slice(0, 10) : []
    let repair: { key: string; label: string; serviceType: string; total: number } | null = null
    if (result === 'REPARO') {
      const options = repairsForSection(await loadRepairs(ctx.tenantId), item.section)
      const opt = options.find((o) => o.key === body.repairKey)
      if (!opt) return NextResponse.json({ error: 'Escolha o reparo.' }, { status: 400 })
      repair = { key: opt.key, label: opt.label, serviceType: opt.serviceType, total: repairTotal(opt.price, 1 + appliesTo.length) }
    }

    const notes = String(body.notes ?? '').trim().slice(0, 1000)
    const finalNotes = appliesTo.length ? serializeNotesWithAppliesTo(notes, appliesTo) || null : notes || null

    await prisma.$transaction(async (tx) => {
      await tx.evaluationItem.update({ where: { id: item.id }, data: { status: STATUS[result], notes: finalNotes, priority: null } })
      // Serviço previsto do item = o reparo escolhido (troca o anterior; o que já
      // foi aprovado/executado não é mexido).
      await tx.evaluationService.deleteMany({ where: { evaluationId: params.id, itemId: item.id, status: 'PREDICTED' } })
      if (repair) {
        await tx.evaluationService.create({
          data: {
            tenantId: ctx.tenantId ?? null, evaluationId: params.id, itemId: item.id, section: item.section,
            description: `${repair.label} — ${item.name}`, serviceType: repair.serviceType, estimatedCost: repair.total,
            status: 'PREDICTED', createdById: session.user.id, notes: `${REPAIR_MARK}${repair.key}`,
          },
        })
      }
    })
    await recalcTotals(params.id)
    await recordHistory({
      tenantId: ctx.tenantId ?? '', evaluationId: params.id, itemId: item.id,
      userId: session.user.id, userName: session.user.name, userRole: session.user.role,
      action: 'UPDATE_ITEM',
      oldValue: { status: item.status, notes: item.notes },
      newValue: { status: STATUS[result], repair: repair?.label ?? null, cost: repair?.total ?? 0, appliesTo },
    })
    return NextResponse.json({ data: { status: STATUS[result], repair } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
