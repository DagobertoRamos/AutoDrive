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

// Visibilidade de COMISSÃO (lançamentos/extrato/relatório): só MASTER/ADM/
// FINANCEIRO veem tudo (para fechamento); TODO o resto — inclusive gerentes —
// vê apenas a PRÓPRIA comissão. (Requisito do cliente.)
const COMMISSION_ALL_ROLES = new Set(['MASTER', 'ADM', 'FINANCEIRO'])

type ActorAccess = {
  sellerId: string | null
  managerId: string | null
  unitId: string | null
}

async function resolveActorAccess(user: SessionUser): Promise<ActorAccess> {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      unitId: true,
      seller: { select: { id: true, unitId: true } },
      manager: { select: { id: true, unitId: true } },
    },
  })

  return {
    sellerId: dbUser?.seller?.id ?? null,
    managerId: dbUser?.manager?.id ?? null,
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

// Visibilidade de comissão (CommissionCalculation). ALL (MASTER/ADM/FINANCEIRO)
// = tenant inteiro. Todos os demais = SOMENTE a própria comissão, onde "própria"
// = é o vendedor (sellerId), OU o gerente (managerId), OU o usuário-ganhador
// (ruleDetails.employeeUserId, p/ gerente-geral/documento/etc.).
export async function buildCommissionAccessWhere(
  user: SessionUser,
  extra: Prisma.CommissionCalculationWhereInput = {},
): Promise<Prisma.CommissionCalculationWhereInput> {
  const tenantWhere: Prisma.CommissionCalculationWhereInput =
    user.role === 'MASTER'
      ? {}
      : { tenantId: user.tenantId ?? NO_MATCH }

  if (COMMISSION_ALL_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere }
  }

  const actor = await resolveActorAccess(user)
  const ownOr: Prisma.CommissionCalculationWhereInput[] = []
  if (actor.sellerId) ownOr.push({ sellerId: actor.sellerId })
  if (actor.managerId) ownOr.push({ managerId: actor.managerId })
  ownOr.push({ ruleDetails: { path: ['employeeUserId'], equals: user.id } as never })

  return { AND: [{ ...extra, ...tenantWhere }, { OR: ownOr }] }
}

// Mesmo escopo, para CommissionExtract (extrato). "Própria" = userId do ganhador
// OU sellerId (vendedor). ALL = tenant inteiro.
export async function buildCommissionExtractAccessWhere(
  user: SessionUser,
  extra: Prisma.CommissionExtractWhereInput = {},
): Promise<Prisma.CommissionExtractWhereInput> {
  const tenantWhere: Prisma.CommissionExtractWhereInput =
    user.role === 'MASTER'
      ? {}
      : { tenantId: user.tenantId ?? NO_MATCH }

  if (COMMISSION_ALL_ROLES.has(user.role)) {
    return { ...extra, ...tenantWhere }
  }

  const actor = await resolveActorAccess(user)
  const ownOr: Prisma.CommissionExtractWhereInput[] = [{ userId: user.id }]
  if (actor.sellerId) ownOr.push({ sellerId: actor.sellerId })

  return { AND: [{ ...extra, ...tenantWhere }, { OR: ownOr }] }
}

export async function getNegotiationActorIds(user: SessionUser): Promise<ActorAccess> {
  return resolveActorAccess(user)
}
