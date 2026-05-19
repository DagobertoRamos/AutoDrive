// =============================================================================
// GET   /api/evaluations/[id] — Detalhe completo (cabeçalho + items + services + attachments)
// PATCH /api/evaluations/[id] — Atualiza campos da avaliação
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { prisma }               from '@/lib/prisma'
import { loadEvaluationContext, recalcTotals } from '@/lib/evaluation/service'
import { canViewEvaluation, canEditEvaluation } from '@/lib/evaluation/permissions'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
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

    return NextResponse.json({
      data: { ...ev, items, services, attachments },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    // Coerções numéricas
    for (const key of ['manufactureYear', 'modelYear', 'km', 'estimatedDays']) {
      if (data[key] != null && data[key] !== '') data[key] = Number(data[key])
      else if (key in data) data[key] = null
    }
    for (const key of ['fipeValue', 'evaluatedValue', 'desiredValue', 'minimumValue', 'suggestedSalePrice']) {
      if (data[key] != null && data[key] !== '') data[key] = Number(data[key])
      else if (key in data) data[key] = null
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
