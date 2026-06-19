// =============================================================================
// Layout do Marketing — área da loja: envolve as telas com o gate de "loja
// ativa" do MASTER (transparente p/ não-MASTER).
// =============================================================================

import { StoreAreaGate } from '@/components/common/StoreAreaGate'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <StoreAreaGate area="o Marketing">{children}</StoreAreaGate>
}
