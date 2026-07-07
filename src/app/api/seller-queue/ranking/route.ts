// =============================================================================
// GET /api/seller-queue/ranking — ranking de qualidade dos vendedores na fila.
// Gate: sellerQueue.view (todos veem — é motivacional). Unit-scoped. ?days=30.
// A FÓRMULA vive em lib/seller-queue/quality.ts — a mesma usada pelo ranking
// geral/da unidade (que soma estes pontos aos de venda). Colaboradores que não
// participam do ranking (flag no cadastro) ficam fora daqui também.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { computeQueueScores } from '@/lib/seller-queue/quality'
import { applyRankingParticipationFilter, getRankingExcludedUnits } from '@/lib/ranking/participation'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 30, 1), 365)
  const since = new Date(Date.now() - days * 86400000)

  try {
    const [scores, excludedUnits] = await Promise.all([
      computeQueueScores({ tenantId, unitId, window: { start: since, end: new Date() } }),
      getRankingExcludedUnits(tenantId),
    ])

    // Unidade fora do ranking → o ranking da fila dela também não é exibido.
    if (excludedUnits.includes(unitId)) {
      return NextResponse.json({ success: true, data: { days, ranking: [], unitExcluded: true } })
    }

    const ids = [...scores.keys()]
    const names = new Map<string, string>()
    if (ids.length) {
      const us = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      us.forEach((u) => names.set(u.id, u.name))
    }

    const rows = await applyRankingParticipationFilter(ids.map((id) => {
      const s = scores.get(id)!
      return {
        userId: id, sellerId: id, sellerName: names.get(id) ?? id,
        finished: s.finished, called: s.called, reversoes: s.reversoes, timeouts: s.timeouts,
        posVendas: s.posVendas, conversoes: s.conversoes, qualidade: s.qualidade,
        avgAcceptSeconds: s.avgAcceptSeconds,
        points: s.points,
      }
    }), { tenantId, unitId, rankingType: 'QUALITY' })
    rows.sort((x, y) => y.points - x.points || y.finished - x.finished)

    return NextResponse.json({ success: true, data: { days, ranking: rows } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
