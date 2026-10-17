// =============================================================================
// POST /api/evaluations/[id]/fipe — preenche a FIPE da avaliação.
//   body {}                                  → busca automática por marca/modelo/ano
//   body { tipo, brandId, modelId, yearId }  → usa a versão escolhida pelo usuário
// Só preenche avaliação SEM FIPE (gerência+ pode substituir). A FIPE vem da
// tabela oficial, não do usuário — por isso não exige permissão de precificar.
// Resposta: { status: 'found' | 'choose' | 'not_found', options?, reason? }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canViewEvaluation, canEditPricing } from '@/lib/evaluation/permissions'
import { resolveFipe, fetchFipePrice, type FipeFound } from '@/lib/evaluation/fipe-resolve'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canViewEvaluation(user, ctx)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const ev = await prisma.vehicleEvaluation.findUnique({
      where: { id: params.id },
      select: { vehicleType: true, brand: true, model: true, version: true, modelYear: true, manufactureYear: true, fuel: true, fipeValue: true },
    })
    if (!ev) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    if (ev.fipeValue != null && !canEditPricing(user))
      return NextResponse.json({ error: 'A avaliação já tem FIPE.' }, { status: 409 })

    const body = await req.json().catch(() => ({})) as { tipo?: string; brandId?: string; modelId?: string; yearId?: string }
    let found: FipeFound | null = null
    if (body.brandId && body.modelId && body.yearId) {
      found = await fetchFipePrice({ tipo: body.tipo || 'carros', brandId: body.brandId, modelId: body.modelId, yearId: body.yearId })
      if (!found) return NextResponse.json({ status: 'not_found', reason: 'Preço FIPE indisponível para essa versão.' })
    } else {
      const r = await resolveFipe(ev)
      if (r.status !== 'found') return NextResponse.json(r)
      found = r.fipe
    }

    await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data: { fipeCode: found.fipeCode, fipeValue: found.fipeValue, fipeReferenceMonth: found.month || null },
    })
    await prisma.auditLog.create({
      data: {
        userId: session.user.id, tenantId: session.user.tenantId ?? null, action: 'EVAL_FIPE_FILLED',
        entity: 'VehicleEvaluation', entityId: params.id, userName: session.user.name, userRole: session.user.role,
        status: 'SUCCESS', afterData: { ...found, chosen: !!body.brandId } as never,
      },
    }).catch(() => {})
    return NextResponse.json({ status: 'found', label: found.label })
  } catch (err) {
    return handlePrismaError(err)
  }
}
