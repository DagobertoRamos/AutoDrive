// =============================================================================
// Configuração de operações por loja (SystemSetting) e capacidades efetivas.
//   ops:config:<tenantId>  → OpsConfig da loja (provedores, acompanhamento, régua)
//   ops:capabilities       → overrides globais do MASTER ({ "*": {...}, "SP": {...} })
// =============================================================================

import { prisma } from '@/lib/prisma'
import { normalizeOpsConfig, resolveCapabilities, type Capabilities, type GlobalCapabilityOverrides, type OpsConfig } from './capabilities'

const tenantKey = (tenantId: string) => `ops:config:${tenantId}`
const GLOBAL_KEY = 'ops:capabilities'

function parse(v: string | null | undefined): unknown {
  if (!v) return null
  try { return JSON.parse(v) } catch { return null }
}

export async function loadOpsConfig(tenantId: string): Promise<OpsConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: tenantKey(tenantId) }, select: { value: true } }).catch(() => null)
  return normalizeOpsConfig(parse(row?.value))
}

export async function saveOpsConfig(tenantId: string, cfg: unknown, userId: string | null): Promise<OpsConfig> {
  const clean = normalizeOpsConfig(cfg)
  const value = JSON.stringify(clean)
  await prisma.systemSetting.upsert({
    where: { key: tenantKey(tenantId) },
    create: { key: tenantKey(tenantId), tenantId, value, group: 'operations', updatedByUserId: userId },
    update: { value, updatedByUserId: userId },
  })
  return clean
}

export async function loadGlobalCapabilities(): Promise<GlobalCapabilityOverrides> {
  const row = await prisma.systemSetting.findUnique({ where: { key: GLOBAL_KEY }, select: { value: true } }).catch(() => null)
  const v = parse(row?.value)
  return v && typeof v === 'object' ? (v as GlobalCapabilityOverrides) : {}
}

export async function saveGlobalCapabilities(v: GlobalCapabilityOverrides, userId: string | null): Promise<void> {
  const value = JSON.stringify(v ?? {})
  await prisma.systemSetting.upsert({
    where: { key: GLOBAL_KEY },
    create: { key: GLOBAL_KEY, tenantId: null, value, group: 'operations', updatedByUserId: userId },
    update: { value, updatedByUserId: userId },
  })
}

/** UF da operação: configuração da filial → cadastro da filial → cadastro da loja. */
export async function operationUf(tenantId: string, unitId: string | null | undefined, cfg?: OpsConfig): Promise<string | null> {
  const c = cfg ?? await loadOpsConfig(tenantId)
  if (unitId && c.units[unitId]?.uf) return c.units[unitId].uf!
  if (unitId) {
    const u = await prisma.unit.findFirst({ where: { id: unitId, tenantId }, select: { state: true } }).catch(() => null)
    if (u?.state) return u.state.toUpperCase()
  }
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { state: true } }).catch(() => null)
  return t?.state?.toUpperCase() ?? null
}

export async function opsContext(tenantId: string, unitId?: string | null): Promise<{ cfg: OpsConfig; caps: Capabilities; uf: string | null }> {
  const [cfg, global] = await Promise.all([loadOpsConfig(tenantId), loadGlobalCapabilities()])
  const uf = await operationUf(tenantId, unitId, cfg)
  return { cfg, caps: resolveCapabilities(uf, global, cfg.capabilities), uf }
}

/** CNPJs da loja e de todas as filiais (conferência de NF-e). */
export async function storeDocs(tenantId: string): Promise<string[]> {
  const [t, units] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { cnpj: true } }),
    prisma.unit.findMany({ where: { tenantId }, select: { cnpj: true } }),
  ])
  return [t?.cnpj, ...units.map((u) => u.cnpj)].map((d) => (d ?? '').replace(/\D/g, '')).filter((d) => d.length === 14)
}
