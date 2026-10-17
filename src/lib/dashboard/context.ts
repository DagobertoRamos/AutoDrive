// =============================================================================
// dashboard/context.ts — quem é o colaborador, qual o escopo dele e os filtros
// Prisma por escopo. Fonte ÚNICA para o dashboard e para a central de atenção:
// tenant SEMPRE vem da sessão (nunca do front), e escopo SELF/UNIT/TENANT
// restringe as consultas no servidor.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { UserRole } from '@/lib/permissions'
import type { SessionUser } from '@/lib/auth-guards'
import { assertTenantId } from '@/lib/auth-guards'
import type { AggregationScope } from '@/lib/goals/aggregators'
import { resolveDashboardProfile } from '@/lib/dashboard/dashboardProfiles'
import { loadDashboardAccess, type DashboardAccess } from '@/lib/dashboard/access'
import type { DashboardProfile } from '@/lib/dashboard/types'
import { getTenantServicesForUser } from '@/lib/tenant-services/resolveTenantServices'
import type { TenantServiceFlags } from '@/lib/tenant-services/types'
import { notDeletedPendencyWhere } from '@/lib/pendencies/access'

/** Valor que nunca casa: usado quando falta vínculo (evita "sem filtro = tudo"). */
export const NO_MATCH = '__dashboard_no_match__'

export interface DashboardContext {
  user: SessionUser
  profile: DashboardProfile
  tenantId: string | null
  unitId: string | null
  /** Seller.id do colaborador (Deal.sellerId / Pendency.responsibleId apontam para Seller). */
  sellerId: string | null
  managerId: string | null
  access: DashboardAccess
  services: TenantServiceFlags
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

const isMaster = (ctx: DashboardContext) => ctx.user.role === 'MASTER'

export function scopedDealWhere(ctx: DashboardContext, extra: Prisma.DealWhereInput = {}): Prisma.DealWhereInput {
  const where: Prisma.DealWhereInput = { ...(isMaster(ctx) ? {} : { tenantId: ctx.tenantId }), ...extra }
  if (ctx.profile.scope === 'SELF') {
    where.sellerId = ctx.sellerId ?? NO_MATCH
    return where
  }
  if (ctx.profile.scope === 'UNIT') where.unitId = ctx.unitId ?? NO_MATCH
  return where
}

export function scopedPendencyWhere(ctx: DashboardContext, extra: Prisma.PendencyWhereInput = {}): Prisma.PendencyWhereInput {
  const where: Prisma.PendencyWhereInput = { ...(isMaster(ctx) ? {} : { tenantId: ctx.tenantId }), ...extra }
  // Pendência "excluída" (cancelada com motivo [EXCLUIDA]) nunca conta.
  where.AND = [...toArray(where.AND), notDeletedPendencyWhere()]
  if (ctx.profile.scope === 'SELF') {
    // AND: não sobrescreve um OR vindo de `extra`
    where.AND = [
      ...toArray(where.AND),
      { OR: [{ responsibleId: ctx.sellerId ?? NO_MATCH }, { assignedUserId: ctx.user.id }] },
    ]
    return where
  }
  if (ctx.profile.scope === 'UNIT') where.unitId = ctx.unitId ?? NO_MATCH
  return where
}

export function scopedLeadWhere(ctx: DashboardContext, extra: Prisma.MarketingLeadWhereInput = {}): Prisma.MarketingLeadWhereInput {
  const where: Prisma.MarketingLeadWhereInput = {
    ...(isMaster(ctx) ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }),
    deletedAt: null, // lead excluído (soft delete) não entra em número nenhum
    ...extra,
  }
  if (ctx.profile.scope === 'SELF' || ctx.profile.kind === 'SDR') {
    where.AND = [
      ...toArray(where.AND),
      { OR: [{ assignedToUserId: ctx.user.id }, { claimedByUserId: ctx.user.id }] },
    ]
    return where
  }
  if (ctx.profile.scope === 'UNIT') where.unitId = ctx.unitId ?? NO_MATCH
  return where
}

export function scopedFinanceProposalWhere(ctx: DashboardContext, extra: Prisma.FinanceProposalWhereInput = {}): Prisma.FinanceProposalWhereInput {
  const where: Prisma.FinanceProposalWhereInput = { ...(isMaster(ctx) ? {} : { tenantId: ctx.tenantId }), ...extra }
  if (ctx.profile.scope === 'SELF') {
    // Mesmo escopo do módulo F&I (proposalScope): quem criou OU o vendedor (Seller.id).
    where.AND = [
      ...toArray(where.AND),
      { OR: [{ createdById: ctx.user.id }, { sellerId: ctx.sellerId ?? NO_MATCH }] },
    ]
  }
  if (ctx.profile.scope === 'UNIT') where.deal = { unitId: ctx.unitId ?? NO_MATCH }
  return where
}

export function scopedFinancialWhere(ctx: DashboardContext, extra: Prisma.FinancialEntryWhereInput = {}): Prisma.FinancialEntryWhereInput {
  const where: Prisma.FinancialEntryWhereInput = { ...(isMaster(ctx) ? {} : { tenantId: ctx.tenantId }), ...extra }
  if (ctx.profile.scope === 'UNIT') where.unitId = ctx.unitId ?? NO_MATCH
  return where
}

export function scopedVehicleWhere(ctx: DashboardContext, extra: Prisma.VehicleWhereInput = {}): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = { ...(isMaster(ctx) ? {} : { tenantId: ctx.tenantId ?? NO_MATCH }), ...extra }
  if (ctx.profile.scope === 'UNIT') where.unitId = ctx.unitId ?? NO_MATCH
  return where
}

export function aggregationScope(ctx: DashboardContext): AggregationScope {
  return {
    tenantId: isMaster(ctx) ? null : ctx.tenantId,
    unitId: ctx.profile.scope === 'UNIT' ? ctx.unitId : null,
    sellerId: ctx.profile.scope === 'SELF' ? ctx.sellerId ?? NO_MATCH : null,
  }
}

async function loadActorContext(user: SessionUser) {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      position: { select: { name: true, slug: true } },
      unit: { select: { name: true } },
      seller: {
        select: {
          id: true,
          cargo: true,
          unitId: true,
          managerId: true,
          position: { select: { name: true, slug: true } },
        },
      },
      manager: {
        select: {
          id: true,
          accessProfile: true,
          unitId: true,
          position: { select: { name: true, slug: true } },
        },
      },
    },
  })

  const isSdrMember = user.tenantId
    ? await prisma.marketingSdrMember.count({
      where: { tenantId: user.tenantId, userId: user.id, active: true },
    }).then((count) => count > 0)
    : false

  const positionName =
    dbUser?.position?.name ??
    dbUser?.seller?.position?.name ??
    dbUser?.manager?.position?.name ??
    dbUser?.seller?.cargo ??
    dbUser?.manager?.accessProfile ??
    null

  const positionSlug =
    dbUser?.position?.slug ??
    dbUser?.seller?.position?.slug ??
    dbUser?.manager?.position?.slug ??
    null

  return { dbUser, isSdrMember, positionName, positionSlug }
}

/** Monta o contexto completo (perfil + escopo + acesso efetivo) em uma leva de consultas. */
export async function resolveDashboardContext(user: SessionUser): Promise<{ ctx: DashboardContext; warnings: string[] }> {
  const tenantId = assertTenantId(user.tenantId, user.role)
  const [actor, tenantServices, access] = await Promise.all([
    loadActorContext(user),
    getTenantServicesForUser(user),
    loadDashboardAccess(user),
  ])
  const effectiveUnitId = user.unitId ?? actor.dbUser?.seller?.unitId ?? actor.dbUser?.manager?.unitId ?? null
  const baseProfile = resolveDashboardProfile({
    role: user.role as UserRole,
    positionName: actor.positionName,
    positionSlug: actor.positionSlug,
    sellerCargo: actor.dbUser?.seller?.cargo,
    managerAccessProfile: actor.dbUser?.manager?.accessProfile,
    unitName: actor.dbUser?.unit?.name ?? null,
    isSdrMember: actor.isSdrMember,
  })
  const services = tenantServices.flags
  const profile: DashboardProfile = {
    ...baseProfile,
    // Exatamente o que está liberado para ESTE colaborador (não só o papel).
    canSeeFinancial: access.can('finance') && services.financeiro,
    canSeeRanking: access.can('ranking') && services.ranking,
  }

  const ctx: DashboardContext = {
    user,
    profile,
    tenantId,
    unitId: effectiveUnitId,
    sellerId: actor.dbUser?.seller?.id ?? null,
    managerId: actor.dbUser?.manager?.id ?? null,
    access,
    services,
  }

  const warnings: string[] = []
  if (profile.scope === 'UNIT' && !effectiveUnitId) {
    warnings.push('Usuário sem unidade vinculada. Alguns blocos foram limitados para evitar vazamento de dados.')
  }
  if (profile.scope === 'SELF' && !ctx.sellerId) {
    warnings.push('Usuário sem cadastro de vendedor vinculado. Métricas individuais podem ficar zeradas.')
  }
  if (!Object.values(services).some(Boolean)) {
    warnings.push('Nenhum serviço ativo foi encontrado para este usuário. O dashboard foi mantido sem blocos de módulos.')
  }
  return { ctx, warnings }
}
