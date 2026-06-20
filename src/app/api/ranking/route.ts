// =============================================================================
// /api/ranking — Ranking comercial (geral do tenant ou de uma unidade)
// =============================================================================

import { NextResponse } from 'next/server'
import type { GoalPeriod } from '@prisma/client'
import {
  getSessionUser,
  assertTenantId,
  unauthorizedResponse,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { computeRanking } from '@/lib/ranking/service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const PERIODS: GoalPeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']

// ── GET — calcular ranking ────────────────────────────────────────────────────

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'ranking'); if (gate) return gate }

  try {
    const { searchParams } = new URL(req.url)

    // MASTER pode informar ?tenantId=; demais usam o próprio tenant.
    const tenantId =
      user.role === 'MASTER'
        ? searchParams.get('tenantId')
        : assertTenantId(user.tenantId, user.role)

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'tenantId é obrigatório para o ranking.' },
        { status: 400 },
      )
    }

    const periodParam = (searchParams.get('period') ?? 'MONTHLY') as GoalPeriod
    const period = PERIODS.includes(periodParam) ? periodParam : 'MONTHLY'

    // Vendedores/usuários comuns só veem o ranking da própria unidade.
    const requestedUnit = searchParams.get('unitId')
    const unitId =
      user.role === 'VENDEDOR' || user.role === 'VENDEDOR_LIDER' || user.role === 'USUARIO' || user.role === 'USUARIO_LIDER'
        ? user.unitId
        : requestedUnit

    const startStr = searchParams.get('start')
    const endStr = searchParams.get('end')

    const result = await computeRanking({
      tenantId,
      unitId,
      period,
      now:   new Date(),
      start: startStr ? new Date(startStr) : undefined,
      end:   endStr ? new Date(endStr) : undefined,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return handlePrismaError(err)
  }
}
