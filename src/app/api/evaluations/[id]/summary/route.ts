// =============================================================================
// GET /api/evaluations/[id]/summary
// Resumo agregado: totais por seção + total geral + cabeçalho do veículo.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canViewEvaluation }    from '@/lib/evaluation/permissions'

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
    const services: any[] = await (prisma as any).evaluationService.findMany({
      where: { evaluationId: params.id, status: { not: 'CANCELED' } },
      select: {
        id: true, section: true, itemId: true, description: true, serviceType: true,
        estimatedCost: true, status: true,
      },
    }).catch(() => [])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = await (prisma as any).evaluationItem.findMany({
      where: { evaluationId: params.id },
      select: { id: true, name: true, section: true },
    }).catch(() => [])

    const itemMap = Object.fromEntries(items.map((i) => [i.id, i]))
    const bySection: Record<string, { total: number; entries: Array<{ item: string | null; description: string; serviceType: string; estimatedCost: number }> }> = {}

    let total = 0
    for (const s of services) {
      const sec = s.section ?? 'GERAL'
      const cost = s.estimatedCost ? Number(s.estimatedCost) : 0
      total += cost
      if (!bySection[sec]) bySection[sec] = { total: 0, entries: [] }
      bySection[sec].total += cost
      bySection[sec].entries.push({
        item:        s.itemId ? itemMap[s.itemId]?.name ?? null : null,
        description: s.description,
        serviceType: s.serviceType,
        estimatedCost: cost,
      })
    }

    return NextResponse.json({
      data: {
        evaluation: {
          id: ev?.id, status: (ev as { status?: string } | null)?.status,
          plate: ev?.plate, brand: ev?.brand, model: ev?.model,
          modelYear: ev?.modelYear, km: ev?.km,
          fipeValue: ev?.fipeValue, evaluatedValue: ev?.evaluatedValue,
          suggestedSalePrice: ev?.suggestedSalePrice,
          totalExpenses: total,
          estimatedDays: (ev as { estimatedDays?: number } | null)?.estimatedDays,
          evaluatorFeedback: (ev as { evaluatorFeedback?: string } | null)?.evaluatorFeedback,
        },
        bySection,
        total,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
