// =============================================================================
// internal-notices/targeting.ts — resolução de público dos avisos internos.
// Centraliza targetType legado e targetTypes avançados usados pela tela Master.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { InternalNotice, Prisma } from '@prisma/client'

export type InternalNoticeTarget = Pick<
  InternalNotice,
  'targetType' | 'targetId' | 'targetTenants' | 'targetUnits' | 'targetRoles' | 'targetUsers'
>

export interface NoticeAudienceUser {
  id: string
  tenantId: string | null
}

const MANAGER_ROLES = ['GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']
const SELLER_ROLES = ['VENDEDOR', 'VENDEDOR_LIDER']

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : []
}

function withFallback(ids: string[], fallback?: string | null): string[] {
  const out = [...ids]
  if (fallback?.trim()) out.push(fallback.trim())
  return [...new Set(out)]
}

function emptyWhere(): Prisma.UserWhereInput {
  return { id: '__NO_INTERNAL_NOTICE_RECIPIENT__' }
}

export function buildInternalNoticeRecipientWhere(notice: InternalNoticeTarget): Prisma.UserWhereInput {
  const active: Prisma.UserWhereInput = { status: 'ATIVO' }
  const targetType = notice.targetType || 'ALL'

  switch (targetType) {
    case 'ALL':
      return active
    case 'ALL_TENANTS':
      return { ...active, tenantId: { not: null } }
    case 'TENANT':
      return notice.targetId ? { ...active, tenantId: notice.targetId } : emptyWhere()
    case 'SELECTED_TENANTS': {
      const ids = withFallback(stringArray(notice.targetTenants), notice.targetId)
      return ids.length ? { ...active, tenantId: { in: ids } } : emptyWhere()
    }
    case 'UNIT':
      return notice.targetId ? { ...active, unitId: notice.targetId } : emptyWhere()
    case 'SELECTED_UNITS': {
      const ids = withFallback(stringArray(notice.targetUnits), notice.targetId)
      return ids.length ? { ...active, unitId: { in: ids } } : emptyWhere()
    }
    case 'ROLE':
      return notice.targetId ? { ...active, role: notice.targetId as never } : emptyWhere()
    case 'SELECTED_ROLES': {
      const roles = withFallback(stringArray(notice.targetRoles), notice.targetId)
      return roles.length ? { ...active, role: { in: roles as never[] } } : emptyWhere()
    }
    case 'USER':
      return notice.targetId ? { ...active, id: notice.targetId } : emptyWhere()
    case 'SELECTED_USERS': {
      const ids = withFallback(stringArray(notice.targetUsers), notice.targetId)
      return ids.length ? { ...active, id: { in: ids } } : emptyWhere()
    }
    case 'MASTER_ONLY':
      return { ...active, role: 'MASTER' }
    case 'ADM_ONLY':
      return { ...active, role: 'ADM' }
    case 'MANAGER_ONLY':
      return { ...active, role: { in: MANAGER_ROLES as never[] } }
    case 'SELLER_ONLY':
      return { ...active, role: { in: SELLER_ROLES as never[] } }
    default:
      return emptyWhere()
  }
}

export function buildInternalNoticeUserAudienceWhere(user: {
  id: string
  role?: string | null
  tenantId?: string | null
  unitId?: string | null
}): Prisma.InternalNoticeWhereInput {
  const or: Prisma.InternalNoticeWhereInput[] = [
    { targetType: 'ALL' },
    { targetType: 'USER', targetId: user.id },
    { targetType: 'SELECTED_USERS', targetUsers: { array_contains: [user.id] } },
  ]

  if (user.role) {
    or.push(
      { targetType: 'ROLE', targetId: user.role },
      { targetType: 'SELECTED_ROLES', targetRoles: { array_contains: [user.role] } },
    )
    if (user.role === 'MASTER') or.push({ targetType: 'MASTER_ONLY' })
    if (user.role === 'ADM') or.push({ targetType: 'ADM_ONLY' })
    if (MANAGER_ROLES.includes(user.role)) or.push({ targetType: 'MANAGER_ONLY' })
    if (SELLER_ROLES.includes(user.role)) or.push({ targetType: 'SELLER_ONLY' })
  }

  if (user.tenantId) {
    or.push(
      { targetType: 'ALL_TENANTS' },
      { targetType: 'TENANT', targetId: user.tenantId },
      { targetType: 'SELECTED_TENANTS', targetTenants: { array_contains: [user.tenantId] } },
    )
  }

  if (user.unitId) {
    or.push(
      { targetType: 'UNIT', targetId: user.unitId },
      { targetType: 'SELECTED_UNITS', targetUnits: { array_contains: [user.unitId] } },
    )
  }

  return { OR: or }
}

export async function resolveInternalNoticeRecipients(notice: InternalNoticeTarget): Promise<NoticeAudienceUser[]> {
  const users = await prisma.user.findMany({
    where: buildInternalNoticeRecipientWhere(notice),
    select: { id: true, tenantId: true },
  })

  const seen = new Set<string>()
  return users.filter((user) => {
    if (seen.has(user.id)) return false
    seen.add(user.id)
    return true
  })
}
