// =============================================================================
// /api/ranking/participation — quem participa do ranking.
// GET  → { excludedUsers: string[], excludedUnits: string[] } (para as telas
//        de cadastro marcarem os toggles; default = todos participam)
// PUT  → { userId?, unitId?, participates: boolean } (um dos dois alvos)
// Gate: gestão (MASTER/ADM/GERENTE_GERAL/GERENTE) via registrations.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, assertTenantId } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'
import {
  getRankingExcludedUsers, getRankingExcludedUnits,
  setUserRankingParticipation, setUnitRankingParticipation,
} from '@/lib/ranking/participation'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  try {
    const tenantId = user.role === 'MASTER'
      ? new URL(req.url).searchParams.get('tenantId')
      : assertTenantId(user.tenantId, user.role)
    if (!tenantId) return NextResponse.json({ success: true, excludedUsers: [], excludedUnits: [] })
    const [excludedUsers, excludedUnits] = await Promise.all([
      getRankingExcludedUsers(tenantId),
      getRankingExcludedUnits(tenantId),
    ])
    return NextResponse.json({ success: true, excludedUsers, excludedUnits })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!MANAGE_ROLES.includes(user.role)) {
    return forbiddenResponse('Apenas a gestão pode alterar a participação no ranking.')
  }
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const body = await req.json().catch(() => ({}))
    const participates = body?.participates !== false

    if (body?.userId && typeof body.userId === 'string') {
      // Valida que o usuário pertence ao tenant antes de gravar.
      const target = await prisma.user.findFirst({ where: { id: body.userId, ...(tenantId ? { tenantId } : {}) }, select: { id: true, tenantId: true } })
      if (!target) return NextResponse.json({ success: false, error: 'Colaborador não encontrado.' }, { status: 404 })
      await setUserRankingParticipation(tenantId ?? target.tenantId ?? '', target.id, participates)
      return NextResponse.json({ success: true, userId: target.id, participates })
    }

    if (body?.unitId && typeof body.unitId === 'string') {
      const unit = await prisma.unit.findFirst({ where: { id: body.unitId, ...(tenantId ? { tenantId } : {}) }, select: { id: true, tenantId: true } })
      if (!unit) return NextResponse.json({ success: false, error: 'Unidade não encontrada.' }, { status: 404 })
      await setUnitRankingParticipation(tenantId ?? unit.tenantId ?? '', unit.id, participates)
      return NextResponse.json({ success: true, unitId: unit.id, participates })
    }

    return NextResponse.json({ success: false, error: 'Informe userId ou unitId.' }, { status: 400 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
