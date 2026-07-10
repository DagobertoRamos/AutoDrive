// =============================================================================
// CRM Reforma F1 — config de Etapas (nome/cor/ordem/ativo por tenant, mapeadas
// aos códigos imutáveis do LeadStatus) + Temperatura. Tudo TOLERANTE: sem a
// migration (crm_stages), cai nos defaults; temperatura vive em metadata JSON.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { CRM_STAGE_OPTIONS } from '@/lib/crm/shared'

export const CRM_TEMPERATURES = [
  { value: 'HOT', label: 'Quente', color: '#ef4444' },
  { value: 'WARM', label: 'Morno', color: '#f59e0b' },
  { value: 'COLD', label: 'Frio', color: '#3b82f6' },
  { value: 'UNCLASSIFIED', label: 'Sem classificação', color: '#9ca3af' },
] as const
export type CrmTemperature = (typeof CRM_TEMPERATURES)[number]['value']

const DEFAULT_STAGE_CATEGORY: Record<string, string> = {
  NEW: 'OPEN', ASSIGNED: 'OPEN', WORKING: 'OPEN', QUALIFIED: 'OPEN',
  CONVERTED: 'CONVERTED', LOST: 'LOST', DISCARDED: 'DISQUALIFIED', RECYCLED: 'RECYCLED',
}
const DEFAULT_STAGE_COLOR: Record<string, string> = {
  NEW: '#6366f1', ASSIGNED: '#0ea5e9', WORKING: '#f59e0b', QUALIFIED: '#10b981',
  CONVERTED: '#22c55e', LOST: '#ef4444', DISCARDED: '#6b7280', RECYCLED: '#a855f7',
}

export interface CrmStageConfig {
  code: string; displayName: string; color: string; order: number; active: boolean; category: string
}

export function defaultStages(): CrmStageConfig[] {
  return CRM_STAGE_OPTIONS.map((s, i) => ({
    code: s.value, displayName: s.label, color: DEFAULT_STAGE_COLOR[s.value] ?? '#6b7280',
    order: i, active: true, category: DEFAULT_STAGE_CATEGORY[s.value] ?? 'OPEN',
  }))
}

/** Etapas efetivas: defaults sobrescritos pelas linhas de CrmStage do tenant. */
export async function loadStages(tenantId: string): Promise<CrmStageConfig[]> {
  const defaults = defaultStages()
  try {
    const rows = await prisma.crmStage.findMany({ where: { tenantId } })
    if (!rows.length) return defaults
    const byCode = new Map(rows.map((r) => [r.code, r]))
    return defaults
      .map((d) => {
        const r = byCode.get(d.code)
        return r
          ? { code: d.code, displayName: r.displayName || d.displayName, color: r.color || d.color, order: r.order, active: r.active, category: r.category || d.category }
          : d
      })
      .sort((a, b) => a.order - b.order)
  } catch {
    return defaults // tabela ainda não migrada
  }
}

/** Temperatura guardada em MarketingLead.metadata.temperature (sem coluna nova). */
export function readTemperature(metadata: unknown): CrmTemperature {
  const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
  const t = String(m.temperature ?? '').toUpperCase()
  return (CRM_TEMPERATURES.some((x) => x.value === t) ? t : 'UNCLASSIFIED') as CrmTemperature
}

export function isValidTemperature(v: unknown): v is CrmTemperature {
  return typeof v === 'string' && CRM_TEMPERATURES.some((x) => x.value === v)
}
