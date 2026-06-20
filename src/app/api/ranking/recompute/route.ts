// =============================================================================
// /api/ranking/recompute — Recalcula e PERSISTE o ranking (cache RankingScore)
// =============================================================================

import { NextResponse } from 'next/server'
import type { GoalPeriod } from '@prisma/client'
import {
  getSessionUser,
  assertTenantId,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canManageRanking, computeRanking, persistRanking } from '@/lib/ranking/service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const PERIODS: GoalPeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'ranking'); if (gate) return gate }
  if (!canManageRanking(user.role)) return forbiddenResponse('Apenas gestores podem recalcular o ranking.')

  try {
    const tenantId =
      user.role === 'MASTER'
        ? new URL(req.url).searchParams.get('tenantId')
        : assertTenantId(user.tenantId, user.role)

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId é obrigatório.' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const periodParam = (searchParams.get('period') ?? 'MONTHLY') as GoalPeriod
    const period = PERIODS.includes(periodParam) ? periodParam : 'MONTHLY'
    const unitId = searchParams.get('unitId')

    const result = await computeRanking({ tenantId, unitId, period, now: new Date() })
    const count = await persistRanking(result, tenantId)

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CALCULATE',
      entity:   'RankingScore',
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: { persisted: count, ...result } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
