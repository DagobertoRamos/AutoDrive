// =============================================================================
// Registro de adapters por domínio. Para plugar uma integradora RENAVE, um
// emissor fiscal (Focus, Nuvem Fiscal, PlugNotas, NFS-e Nacional) ou um
// provedor de transferência: implementar a interface de types.ts e registrar
// aqui. A escolha é por loja (Configurações › Operações).
// =============================================================================

import { manualFiscal, manualRenave, manualTransfer } from './manual'
import type { FiscalProvider, ProviderInfo, RenaveProvider, TransferProvider } from './types'

const RENAVE: Record<string, RenaveProvider> = { MANUAL: manualRenave }
const FISCAL: Record<string, FiscalProvider> = { MANUAL: manualFiscal }
const TRANSFER: Record<string, TransferProvider> = { MANUAL: manualTransfer }

export type GatewayDomain = 'renave' | 'fiscal' | 'transfer'

export function renaveProvider(id: string | null | undefined): RenaveProvider { return RENAVE[id ?? ''] ?? manualRenave }
export function fiscalProvider(id: string | null | undefined): FiscalProvider { return FISCAL[id ?? ''] ?? manualFiscal }
export function transferProvider(id: string | null | undefined): TransferProvider { return TRANSFER[id ?? ''] ?? manualTransfer }

export function listProviders(domain: GatewayDomain): ProviderInfo[] {
  const src = domain === 'renave' ? RENAVE : domain === 'fiscal' ? FISCAL : TRANSFER
  return Object.values(src).map((p) => p.info)
}
