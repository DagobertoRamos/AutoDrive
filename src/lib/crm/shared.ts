import type { Prisma } from '@prisma/client'
import type { SessionUser } from '@/lib/auth-guards'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const CRM_STAGE_OPTIONS = [
  { value: 'NEW', label: 'Novo' },
  { value: 'ASSIGNED', label: 'Tentando contato' },
  { value: 'WORKING', label: 'Contatado' },
  { value: 'QUALIFIED', label: 'Qualificado' },
  { value: 'CONVERTED', label: 'Convertido' },
  { value: 'LOST', label: 'Perdido' },
  { value: 'DISCARDED', label: 'Desqualificado' },
  { value: 'RECYCLED', label: 'Reaberto' },
] as const

export type CrmStageValue = typeof CRM_STAGE_OPTIONS[number]['value']
export type CrmScope = 'own' | 'unit' | 'all'

export async function resolveCrmScope(user: SessionUser): Promise<CrmScope | null> {
  if (await canAccessModuleForUser(user, 'crm.view.all')) return 'all'
  if (await canAccessModuleForUser(user, 'crm.view.unit')) return 'unit'
  if (await canAccessModuleForUser(user, 'crm.view.own')) return 'own'
  return null
}

export async function resolveCrmAttendanceScope(user: SessionUser): Promise<CrmScope | null> {
  if (await canAccessModuleForUser(user, 'crm.view.all')) return 'all'
  if (await canAccessModuleForUser(user, 'crm.attendance.view.unit')) return 'unit'
  if (await canAccessModuleForUser(user, 'crm.attendance.view.own')) return 'own'
  return null
}

export function applyCrmScope<T extends Record<string, unknown>>(
  where: T,
  scope: CrmScope,
  user: SessionUser,
): T & Prisma.MarketingLeadWhereInput {
  if (scope === 'own') return { ...where, assignedToUserId: user.id }
  if (scope === 'unit') return { ...where, unitId: user.unitId ?? '__missing_unit__' }
  return where
}

export function applyCrmAttendanceScope<T extends Record<string, unknown>>(
  where: T,
  scope: CrmScope,
  user: SessionUser,
): T & Prisma.SellerQueueAttendanceWhereInput {
  if (scope === 'own') return { ...where, sellerId: user.id }
  if (scope === 'unit') return { ...where, unitId: user.unitId ?? '__missing_unit__' }
  return where
}

export function normalizePhone(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}
