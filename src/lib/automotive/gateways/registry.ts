// =============================================================================
// Registro de adapters por domínio. O provedor de cada loja vem da conexão
// ativa (Configurações › Operações › Conexões); sem conexão, modo manual.
// Para plugar outro provedor: implementar a interface de types.ts (ou falar o
// Conector AutoDrive) e incluí-lo no catálogo (providers-catalog.ts).
// =============================================================================

import { providerEntry, providersFor } from '../providers-catalog'
import { acbrApi, focusNfe, nuvemFiscal, plugNotas } from './fiscal-api'
import { manualFiscal, manualRenave, manualTransfer } from './manual'
import { partnerRenave, partnerTransfer } from './partner'
import type { FiscalProvider, ProviderContext, ProviderInfo, RenaveProvider, TestResult, TransferProvider } from './types'
import { vehicleDataProvider } from './vehicle-data'

const FISCAL: Record<string, FiscalProvider> = { MANUAL: manualFiscal, FOCUS_NFE: focusNfe, PLUGNOTAS: plugNotas, NUVEM_FISCAL: nuvemFiscal, ACBR_API: acbrApi }

export type GatewayDomain = 'renave' | 'fiscal' | 'transfer'

export function renaveProvider(id: string | null | undefined): RenaveProvider {
  const e = providerEntry('RENAVE', id)
  return e && e.mode === 'PARCEIRO' ? partnerRenave(e.id, e.name) : manualRenave
}
export function fiscalProvider(id: string | null | undefined): FiscalProvider { return FISCAL[id ?? ''] ?? manualFiscal }
export function transferProvider(id: string | null | undefined): TransferProvider {
  const e = providerEntry('TRANSFER', id)
  return e && e.mode === 'PARCEIRO' ? partnerTransfer(e.id, e.name) : manualTransfer
}

export function listProviders(domain: GatewayDomain): ProviderInfo[] {
  const d = domain === 'renave' ? 'RENAVE' : domain === 'fiscal' ? 'FISCAL' : 'TRANSFER'
  return providersFor(d).map((p) => ({ id: p.id, label: p.name, mode: p.mode === 'MANUAL' ? 'MANUAL' : 'API', webhooks: p.mode !== 'MANUAL' }))
}

/** "Testar conexão" de qualquer domínio. */
export async function testProvider(domain: string, providerId: string, ctx: ProviderContext): Promise<TestResult> {
  const t = domain === 'RENAVE' ? renaveProvider(providerId).test
    : domain === 'FISCAL' ? fiscalProvider(providerId).test
    : domain === 'TRANSFER' ? transferProvider(providerId).test
    : domain === 'VEHICLE_DATA' ? vehicleDataProvider(providerId)?.test
    : undefined
  if (!t) return { ok: false, message: 'Este provedor não tem teste automático.' }
  try { return await t(ctx) } catch (e) { return { ok: false, message: e instanceof Error ? e.message : 'Falha no teste.' } }
}
