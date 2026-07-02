import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/lib/auth-guards'

const NO_MATCH = '__no_negotiation_access__'

const TENANT_WIDE_ROLES = new Set([
  'MASTER',
  'ADM',
  'GERENTE_GERAL',
  'GERENTE_ADMINISTRATIVO',
  'FINANCEIRO',
])

const UNIT_ROLES = new Set(['GERENTE'])
const OWN_ROLES = new Set(['VENDEDOR', 'VENDEDOR_LIDER'])

type ActorAccess = {
  sellerId: string | null
  unitId: string | null
}

async function resolveActorAccess(user: SessionUser): Promise<ActorAccess> {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      unitId: true,
      seller: { select: { id: true, unitId: true } },
      manager: { select: { unitId: true } },
    },
  })

  return {
    sellerId: dbUser?.seller?.id ?? null,
    unitId: user.unitId ?? dbUser?.manager?.unitId ?? dbUser?.seller?.unitId ?? dbUser?.unitId ?? null,
  }
}

export async function buildNegotiationAccessWhere(
  user: SessionUser,
  extra: Prisma.DealWhereInput = {},
): Promise<Prisma.DealWhereInput> {
  const tenantWhere: Prisma.DealWhereInput =
    user.role === 'MASTER'
      ? {}
      : { tenantId: user.tenantId ?? NO_MATCH }

  if (TENANT_WIDE_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere }
  }

  const actor = await resolveActorAccess(user)

  if (UNIT_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere, unitId: actor.unitId ?? NO_MATCH }
  }

  if (OWN_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere, sellerId: actor.sellerId ?? NO_MATCH }
  }

  return { ...extra, ...tenantWhere, id: NO_MATCH }
}

export async function buildCommissionAccessWhere(
  user: SessionUser,
  extra: Prisma.CommissionCalculationWhereInput = {},
): Promise<Prisma.CommissionCalculationWhereInput> {
  const tenantWhere: Prisma.CommissionCalculationWhereInput =
    user.role === 'MASTER'
      ? {}
      : { tenantId: user.tenantId ?? NO_MATCH }

  if (TENANT_WIDE_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere }
  }

  const actor = await resolveActorAccess(user)

  if (UNIT_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere, unitId: actor.unitId ?? NO_MATCH }
  }

  if (OWN_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere, sellerId: actor.sellerId ?? NO_MATCH }
  }

  return { ...extra, ...tenantWhere, id: NO_MATCH }
}

// Mesmo escopo de visibilidade, mas para CommissionExtract (extrato). Os campos
// tenantId/sellerId/unitId existem nos dois models, então a regra é idêntica:
// ALL=tenant, UNIT=unidade do gerente, OWN=próprio vendedor, demais=nada.
export async function buildCommissionExtractAccessWhere(
  user: SessionUser,
  extra: Prisma.CommissionExtractWhereInput = {},
): Promise<Prisma.CommissionExtractWhereInput> {
  const tenantWhere: Prisma.CommissionExtractWhereInput =
    user.role === 'MASTER'
      ? {}
      : { tenantId: user.tenantId ?? NO_MATCH }

  if (TENANT_WIDE_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere }
  }

  const actor = await resolveActorAccess(user)

  if (UNIT_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere, unitId: actor.unitId ?? NO_MATCH }
  }

  if (OWN_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere, sellerId: actor.sellerId ?? NO_MATCH }
  }

  return { ...extra, ...tenantWhere, id: NO_MATCH }
}

export async function getNegotiationActorIds(user: SessionUser): Promise<ActorAccess> {
  return resolveActorAccess(user)
}
