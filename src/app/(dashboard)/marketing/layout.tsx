// =============================================================================
// Layout do Marketing — envolve as telas com o gate de "loja ativa" do MASTER.
// Para não-MASTER é transparente; para o MASTER exige selecionar a loja.
// =============================================================================

import { MarketingMasterGate } from '@/components/marketing/MarketingMasterGate'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingMasterGate>{children}</MarketingMasterGate>
}
