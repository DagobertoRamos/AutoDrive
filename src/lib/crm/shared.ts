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

// Temperatura do lead (F1) — const PURA (client-safe). Separada das etiquetas.
export const CRM_TEMPERATURES = [
  { value: 'HOT', label: 'Quente', color: '#ef4444', emoji: '🔥' },
  { value: 'WARM', label: 'Morno', color: '#f59e0b', emoji: '🌤️' },
  { value: 'COLD', label: 'Frio', color: '#3b82f6', emoji: '❄️' },
  { value: 'UNCLASSIFIED', label: 'Sem classificação', color: '#9ca3af', emoji: '⚪' },
] as const
export type CrmTemperatureValue = (typeof CRM_TEMPERATURES)[number]['value']
export function crmTemperature(value: string | null | undefined) {
  return CRM_TEMPERATURES.find((t) => t.value === value) ?? CRM_TEMPERATURES[3]
}

// Campos exigíveis por etapa (F3) — const PURA (client-safe).
export const CRM_REQUIRABLE_FIELDS = [
  { key: 'name', label: 'Nome' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'vehicleId', label: 'Veículo de interesse' },
  { key: 'assignedToUserId', label: 'Responsável' },
] as const
export type CrmRequirableField = (typeof CRM_REQUIRABLE_FIELDS)[number]['key']

export function crmStageLabel(value: string | null | undefined): string {
  return CRM_STAGE_OPTIONS.find((item) => item.value === value)?.label ?? (value || 'Sem etapa')
}

export function crmSourceLabel(value: string | null | undefined): string {
  const source = String(value ?? '').trim().toUpperCase()
  if (!source) return 'Sem origem'
  const labels: Record<string, string> = {
    MANUAL: 'Manual',
    AUTOCONF: 'AutoConf',
    FILA_ATENDIMENTO: 'Fila de atendimento',
    CRM_MANUAL: 'CRM manual',
    CLIENTE_NA_LOJA: 'Cliente na loja',
  }
  return labels[source] ?? value ?? 'Sem origem'
}

export function crmPriorityLabel(value: string): string {
  const labels: Record<string, string> = {
    URGENT: 'Urgente',
    HIGH: 'Alta',
    NORMAL: 'Normal',
    LOW: 'Baixa',
  }
  return labels[value] ?? value
}

export function crmPriorityTone(value: string): string {
  const tones: Record<string, string> = {
    URGENT: 'text-red-700 bg-red-50 border-red-200',
    HIGH: 'text-amber-700 bg-amber-50 border-amber-200',
    NORMAL: 'text-sky-700 bg-sky-50 border-sky-200',
    LOW: 'text-gray-700 bg-gray-50 border-gray-200',
  }
  return tones[value] ?? tones.NORMAL
}

export function canAccessLeadByScope(
  scope: CrmScope,
  user: SessionUser,
  lead: { assignedToUserId: string | null; unitId: string | null },
): boolean {
  if (scope === 'all') return true
  if (scope === 'unit') return lead.unitId != null && lead.unitId === user.unitId
  return lead.assignedToUserId === user.id
}

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
