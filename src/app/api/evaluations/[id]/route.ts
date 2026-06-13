// =============================================================================
// GET   /api/evaluations/[id] — Detalhe completo (cabeçalho + items + services + attachments)
// PATCH /api/evaluations/[id] — Atualiza campos da avaliação
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { prisma }               from '@/lib/prisma'
import { loadEvaluationContext, recalcTotals } from '@/lib/evaluation/service'
import {
  canViewEvaluation, canEditEvaluation, canEditPricing, canViewPricing,
  PRICING_FIELDS,
} from '@/lib/evaluation/permissions'

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canViewEvaluation(user, ctx))
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const ev = await prisma.vehicleEvaluation.findUnique({ where: { id: params.id } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = await (prisma as any).evaluationItem.findMany({
      where:   { evaluationId: params.id },
      orderBy: [{ section: 'asc' }, { name: 'asc' }],
    }).catch(() => [])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const services: any[] = await (prisma as any).evaluationService.findMany({
      where:   { evaluationId: params.id },
      orderBy: { createdAt: 'asc' },
    }).catch(() => [])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachments: any[] = await (prisma as any).evaluationAttachment.findMany({
      where:   { evaluationId: params.id },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [])

    // Mascara pricing para quem não pode visualizar
    const showPricing = ev ? canViewPricing(user, {
      status: ev.status ?? 'DRAFT',
      tenantId: ev.tenantId,
      unitId: ev.unitId,
      evaluatorId: ev.evaluatedById,
      result: ev.result,
    }) : false
    const safeEv = ev ? { ...ev } as Record<string, unknown> : ev
    if (safeEv && !showPricing) {
      for (const f of PRICING_FIELDS) safeEv[f] = null
      safeEv.evaluatorFeedback = null
    }

    return NextResponse.json({
      data: { ...(safeEv as object), items, services, attachments, _pricingHidden: !showPricing },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canEditEvaluation(user, ctx))
      return NextResponse.json({ error: 'Sem permissão para editar nesta avaliação' }, { status: 403 })

    const body = await req.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    const allowed = [
      'plate', 'brand', 'model', 'version', 'manufactureYear', 'modelYear',
      'km', 'color', 'fuel', 'transmission', 'chassi', 'renavam',
      'vehicleType', 'conditionType', 'fipeCode', 'fipeReferenceMonth',
      'fipeValue', 'evaluatedValue', 'desiredValue', 'minimumValue',
      'suggestedSalePrice', 'evaluationNotes', 'ownerName', 'ownerCpf',
      'ownerPhone', 'ownerEmail', 'cautelarStatus', 'cautelarNumber',
      'cautelarNotes', 'pendencyNotes', 'estimatedDays',
      'evaluatorFeedback', 'testDriveDone', 'status',
    ]
    const pricingSet = new Set<string>(PRICING_FIELDS as readonly string[])
    const canPrice = canEditPricing(user)
    for (const key of allowed) {
      if (!(key in body)) continue
      // Bloqueia VENDEDOR/etc de tocar em pricing pelo PATCH genérico
      if (pricingSet.has(key) && !canPrice) continue
      data[key] = body[key]
    }

    // Coerções numéricas com guard anti-NaN
    const safeNumber = (v: unknown): number | null => {
      if (v == null || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    for (const key of ['manufactureYear', 'modelYear', 'km', 'estimatedDays']) {
      if (key in data) data[key] = safeNumber(data[key])
    }
    for (const key of ['fipeValue', 'evaluatedValue', 'desiredValue', 'minimumValue', 'suggestedSalePrice']) {
      if (key in data) data[key] = safeNumber(data[key])
    }

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data,
    })

    // Recalcular total (caso services tenham sido alterados em paralelo)
    void recalcTotals(params.id)

    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId: session.user.tenantId ?? null,
        action:   'UPDATE',
        entity:   'VehicleEvaluation',
        entityId: params.id,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
