// =============================================================================
// /api/ranking/participants — Configuração granular de participantes do ranking.
// GET    lista usuários elegíveis por tipo/unidade
// PUT    grava participação por usuário no escopo selecionado
// DELETE restaura o padrão do escopo (sem registros explícitos)
// =============================================================================

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  createSafeAuditLog,
  forbiddenResponse,
  getSessionUser,
  unauthorizedResponse,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import {
  getEligibleUsersForRankingConfig,
  isRankingType,
  isUnitScopedRankingType,
  RANKING_CONFIG_ROLES,
  RANKING_TYPE_LABELS,
  RANKING_TYPES,
  restoreRankingParticipantsDefault,
  type RankingType,
  updateRankingParticipantsConfig,
} from '@/lib/ranking/participation'

const TENANT_WIDE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO']
const UNIT_MANAGE_ROLES = [...TENANT_WIDE_ROLES, 'GERENTE']

const participantSchema = z.object({
  userId: z.string().min(1),
  participates: z.boolean(),
})

const updateSchema = z.object({
  rankingType: z.enum(RANKING_TYPES),
  unitId: z.string().min(1).nullable().optional(),
  participants: z.array(participantSchema).max(500),
})

function parseRankingType(value: string | null): RankingType {
  return isRankingType(value) ? value : 'GENERAL'
}

function canManageScope(role: string, rankingType: RankingType): boolean {
  if (rankingType === 'GENERAL') return TENANT_WIDE_ROLES.includes(role)
  return UNIT_MANAGE_ROLES.includes(role)
}

async function resolveScope(req: Request, rankingType: RankingType, requestedUnitId: string | null | undefined) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() as NextResponse }

  const gate = await assertModuleEnabled(user, 'ranking')
  if (gate) return { error: gate }
  if (!canAccessModule(user.role, 'ranking.settings.view')) {
    return { error: forbiddenResponse('Sem acesso à configuração de participantes do ranking.') }
  }
  if (!canManageScope(user.role, rankingType)) {
    return { error: forbiddenResponse('Seu perfil não pode configurar este tipo de ranking.') }
  }

  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(user)) }

  const unitScoped = isUnitScopedRankingType(rankingType)
  let unitId: string | null = unitScoped ? requestedUnitId ?? null : null
  if (unitScoped && user.role === 'GERENTE') unitId = user.unitId

  if (unitScoped && !unitId) {
    const firstUnit = await prisma.unit.findFirst({
      where: { tenantId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true },
    })
    unitId = firstUnit?.id ?? null
  }

  if (unitScoped && !unitId) {
    return { error: NextResponse.json({ success: false, error: 'Informe a unidade do ranking.' }, { status: 400 }) }
  }

  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, tenantId }, select: { id: true } })
    if (!unit) {
      return { error: NextResponse.json({ success: false, error: 'Unidade não encontrada para esta loja.' }, { status: 404 }) }
    }
    if (user.role === 'GERENTE' && user.unitId !== unitId) {
      return { error: forbiddenResponse('Gerente só pode configurar a própria unidade.') }
    }
  }

  return { user, tenantId, unitId }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const rankingType = parseRankingType(sp.get('rankingType'))
  const scope = await resolveScope(req, rankingType, sp.get('unitId'))
  if ('error' in scope) return scope.error

  try {
    const units = await prisma.unit.findMany({
      where: { tenantId: scope.tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const users = await getEligibleUsersForRankingConfig({
      tenantId: scope.tenantId,
      unitId: scope.unitId,
      rankingType,
      includeInactive: sp.get('includeInactive') === 'true',
      role: sp.get('role'),
      search: sp.get('q'),
    })

    return NextResponse.json({
      success: true,
      data: {
        rankingType,
        unitId: scope.unitId,
        users,
        units,
        types: RANKING_TYPES.map((type) => ({
          value: type,
          label: RANKING_TYPE_LABELS[type],
          unitScoped: isUnitScopedRankingType(type),
        })),
        roles: RANKING_CONFIG_ROLES,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request) {
  try {
    const data = updateSchema.parse(await req.json())
    const scope = await resolveScope(req, data.rankingType, data.unitId)
    if ('error' in scope) return scope.error

    const ids = [...new Set(data.participants.map((participant) => participant.userId))]
    const validUsers = ids.length
      ? await prisma.user.findMany({
          where: {
            id: { in: ids },
            tenantId: scope.tenantId,
            ...(scope.unitId ? { unitId: scope.unitId } : {}),
          },
          select: { id: true },
        })
      : []
    const validIds = new Set(validUsers.map((user) => user.id))
    if (validIds.size !== ids.length) {
      return NextResponse.json(
        { success: false, error: 'Existe colaborador fora da loja ou unidade selecionada.' },
        { status: 400 },
      )
    }

    const result = await updateRankingParticipantsConfig({
      tenantId: scope.tenantId,
      unitId: scope.unitId,
      rankingType: data.rankingType,
      participants: data.participants,
      updatedByUserId: scope.user.id,
    })

    await createSafeAuditLog({
      userId: scope.user.id,
      tenantId: scope.tenantId,
      action: 'RANKING_PARTICIPATION_UPDATE',
      entity: 'RankingParticipation',
      entityId: `${data.rankingType}:${scope.unitId ?? 'tenant'}`,
      beforeData: result.before,
      afterData: result.after,
      userName: scope.user.name,
      userRole: scope.user.role,
    })

    return NextResponse.json({ success: true, data: result.after })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0]?.message ?? 'Dados inválidos.', issues: err.errors },
        { status: 400 },
      )
    }
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams
  const rankingType = parseRankingType(sp.get('rankingType'))
  const scope = await resolveScope(req, rankingType, sp.get('unitId'))
  if ('error' in scope) return scope.error

  try {
    const before = await restoreRankingParticipantsDefault({
      tenantId: scope.tenantId,
      unitId: scope.unitId,
      rankingType,
    })

    await createSafeAuditLog({
      userId: scope.user.id,
      tenantId: scope.tenantId,
      action: 'RANKING_PARTICIPATION_RESTORE_DEFAULT',
      entity: 'RankingParticipation',
      entityId: `${rankingType}:${scope.unitId ?? 'tenant'}`,
      beforeData: before,
      afterData: [],
      userName: scope.user.name,
      userRole: scope.user.role,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
