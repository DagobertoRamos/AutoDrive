// =============================================================================
// Capacidades por UF / provedor e configuração da loja (puro).
// Nada de "if (uf === 'SP')" espalhado: toda regra estadual ou funcionalidade
// em implantação é uma capacidade, resolvida em camadas:
//   padrão da plataforma → MASTER global ("*") → MASTER por UF → loja.
// =============================================================================

export const CAPABILITY_KEYS = [
  'renave.entry',
  'renave.exit',
  'renave.consignment',        // RENAVE_CONSIGNMENT_ENABLED
  'renave.storeTransfer',
  'fiscal.nfe',
  'fiscal.nfse',
  'fiscal.nfce',
  'transfer.digital',          // DIGITAL_TRANSFER_ENABLED (ATPV-e)
  'transfer.inspectionRequired',
  'inspection.integration',
] as const
export type CapabilityKey = typeof CAPABILITY_KEYS[number]
export type Capabilities = Record<CapabilityKey, boolean>

export const CAPABILITY_LABEL: Record<CapabilityKey, string> = {
  'renave.entry': 'Entrada no RENAVE',
  'renave.exit': 'Saída no RENAVE',
  'renave.consignment': 'Consignação no RENAVE',
  'renave.storeTransfer': 'Transferência entre lojas no RENAVE',
  'fiscal.nfe': 'NF-e',
  'fiscal.nfse': 'NFS-e',
  'fiscal.nfce': 'NFC-e',
  'transfer.digital': 'Transferência digital (ATPV-e)',
  'transfer.inspectionRequired': 'Vistoria obrigatória na transferência',
  'inspection.integration': 'Vistoria integrada',
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  'renave.entry': true,
  'renave.exit': true,
  'renave.consignment': false,
  'renave.storeTransfer': true,
  'fiscal.nfe': true,
  'fiscal.nfse': true,
  'fiscal.nfce': false,
  'transfer.digital': true,
  'transfer.inspectionRequired': true,
  'inspection.integration': false,
}

/** Overrides do MASTER: { "*": {...}, "SP": {...} } */
export type GlobalCapabilityOverrides = Record<string, Partial<Capabilities>>

function pick(src: unknown): Partial<Capabilities> {
  const out: Partial<Capabilities> = {}
  if (!src || typeof src !== 'object') return out
  for (const k of CAPABILITY_KEYS) {
    const v = (src as Record<string, unknown>)[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

export function resolveCapabilities(uf: string | null | undefined, global: GlobalCapabilityOverrides | null | undefined, tenant: Partial<Capabilities> | null | undefined): Capabilities {
  const state = (uf ?? '').trim().toUpperCase()
  return {
    ...DEFAULT_CAPABILITIES,
    ...pick(global?.['*']),
    ...(state ? pick(global?.[state]) : {}),
    ...pick(tenant),
  }
}

// ── Configuração da loja ─────────────────────────────────────────────────────

export type Enforcement = 'OFF' | 'WARN' | 'BLOCK'

export interface UnitFiscalConfig { ie?: string | null; im?: string | null; fiscalSeries?: string | null; uf?: string | null }

export interface OpsConfig {
  providers: { renave: string; fiscal: string; transfer: string }
  /** O que o sistema acompanha (gera pendência na operação). */
  tracking: { renave: boolean; fiscalSale: boolean; fiscalPurchase: boolean; transfer: boolean; inspection: boolean }
  /** Quanto cada item pesa antes de vender: OFF ignora, WARN avisa, BLOCK impede. */
  enforcement: { renaveEntry: Enforcement; fiscalEntry: Enforcement; inspection: Enforcement; documents: Enforcement }
  capabilities: Partial<Capabilities>
  units: Record<string, UnitFiscalConfig>
  /** Regras fiscais da loja (normalizadas com a UF em fiscal-rules.ts). */
  fiscalRules: Record<string, unknown> | null
}

export const DEFAULT_OPS_CONFIG: OpsConfig = {
  providers: { renave: 'MANUAL', fiscal: 'MANUAL', transfer: 'MANUAL' },
  tracking: { renave: true, fiscalSale: true, fiscalPurchase: true, transfer: true, inspection: false },
  enforcement: { renaveEntry: 'WARN', fiscalEntry: 'WARN', inspection: 'OFF', documents: 'WARN' },
  capabilities: {},
  units: {},
  fiscalRules: null,
}

const ENF = new Set<Enforcement>(['OFF', 'WARN', 'BLOCK'])

/** Lê o JSON salvo, completa com o padrão e descarta lixo. */
export function normalizeOpsConfig(raw: unknown): OpsConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const d = DEFAULT_OPS_CONFIG
  const str = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : fb)
  const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb)
  const enf = (v: unknown, fb: Enforcement) => (ENF.has(v as Enforcement) ? (v as Enforcement) : fb)
  const units: Record<string, UnitFiscalConfig> = {}
  if (r.units && typeof r.units === 'object') {
    for (const [id, u] of Object.entries(r.units as Record<string, any>)) {
      if (!id || typeof u !== 'object' || !u) continue
      const clean = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 30) || null : null)
      units[id] = { ie: clean(u.ie), im: clean(u.im), fiscalSeries: clean(u.fiscalSeries), uf: clean(u.uf)?.toUpperCase() ?? null }
    }
  }
  return {
    providers: { renave: str(r.providers?.renave, d.providers.renave), fiscal: str(r.providers?.fiscal, d.providers.fiscal), transfer: str(r.providers?.transfer, d.providers.transfer) },
    tracking: {
      renave: bool(r.tracking?.renave, d.tracking.renave),
      fiscalSale: bool(r.tracking?.fiscalSale, d.tracking.fiscalSale),
      fiscalPurchase: bool(r.tracking?.fiscalPurchase, d.tracking.fiscalPurchase),
      transfer: bool(r.tracking?.transfer, d.tracking.transfer),
      inspection: bool(r.tracking?.inspection, d.tracking.inspection),
    },
    enforcement: {
      renaveEntry: enf(r.enforcement?.renaveEntry, d.enforcement.renaveEntry),
      fiscalEntry: enf(r.enforcement?.fiscalEntry, d.enforcement.fiscalEntry),
      inspection: enf(r.enforcement?.inspection, d.enforcement.inspection),
      documents: enf(r.enforcement?.documents, d.enforcement.documents),
    },
    capabilities: pick(r.capabilities),
    units,
    fiscalRules: r.fiscalRules && typeof r.fiscalRules === 'object' ? (r.fiscalRules as Record<string, unknown>) : null,
  }
}

/** O que a operação precisa, já cruzando acompanhamento da loja × capacidade da UF. */
export function operationRequirements(kind: string, cfg: OpsConfig, caps: Capabilities, opts: { consigned?: boolean } = {}) {
  const sale = kind === 'SALE'
  const renaveCap = kind === 'STORE_TRANSFER' ? caps['renave.storeTransfer']
    : sale ? caps['renave.exit'] && (!opts.consigned || caps['renave.consignment'])
    : kind === 'CONSIGNMENT' ? caps['renave.consignment']
    : caps['renave.entry']
  return {
    renave: cfg.tracking.renave && renaveCap,
    fiscal: caps['fiscal.nfe'] && (sale ? cfg.tracking.fiscalSale : kind === 'STORE_TRANSFER' ? true : cfg.tracking.fiscalPurchase),
    transfer: sale && cfg.tracking.transfer,
    inspection: cfg.tracking.inspection,
    inspectionOnTransfer: caps['transfer.inspectionRequired'],
  }
}
