// =============================================================================
// Margem do preço sugerido por loja (SystemSetting `evaluation:pricing:<tenantId>`,
// JSON { marginPct }). Alterações vão para o AuditLog (entity EvaluationPricing).
// Regra do cálculo em suggested-price.ts.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { DEFAULT_MARGIN_PCT, MAX_MARGIN_PCT, normalizeMarginPct } from './suggested-price'

const KEY = (tenantId: string) => `evaluation:pricing:${tenantId}`
export const PRICING_AUDIT_ENTITY = 'EvaluationPricing'

export interface EvaluationPricingSettings { marginPct: number }

export async function loadPricingSettings(tenantId: string | null | undefined): Promise<EvaluationPricingSettings> {
  if (!tenantId) return { marginPct: DEFAULT_MARGIN_PCT }
  const row = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row?.value) return { marginPct: DEFAULT_MARGIN_PCT }
  try {
    return { marginPct: normalizeMarginPct((JSON.parse(row.value) as { marginPct?: unknown }).marginPct) }
  } catch { return { marginPct: DEFAULT_MARGIN_PCT } }
}

export async function savePricingSettings(
  tenantId: string, raw: { marginPct?: unknown }, actor: { id: string; name: string | null; role: string },
): Promise<{ ok: true; data: EvaluationPricingSettings } | { ok: false; error: string }> {
  const n = Number(String(raw.marginPct ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > MAX_MARGIN_PCT) return { ok: false, error: `Margem deve ficar entre 0% e ${MAX_MARGIN_PCT}%.` }
  const data = { marginPct: normalizeMarginPct(n) }
  const before = await loadPricingSettings(tenantId)
  if (before.marginPct === data.marginPct) return { ok: true, data }
  const value = JSON.stringify(data)
  const existing = await prisma.systemSetting.findFirst({ where: { key: KEY(tenantId) }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value, updatedByUserId: actor.id } })
  else await prisma.systemSetting.create({ data: { key: KEY(tenantId), tenantId, value, group: 'evaluation', updatedByUserId: actor.id, description: 'Margem do preço sugerido da avaliação' } })
  await prisma.auditLog.create({
    data: {
      userId: actor.id, tenantId, action: 'UPDATE', entity: PRICING_AUDIT_ENTITY, entityId: tenantId,
      userName: actor.name, userRole: actor.role, status: 'SUCCESS',
      beforeData: before as never, afterData: data as never,
    },
  }).catch(() => {})
  return { ok: true, data }
}
