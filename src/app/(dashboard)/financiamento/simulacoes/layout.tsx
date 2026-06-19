// =============================================================================
// Layout de F&I › Simulações — área da loja: gate de "loja ativa" do MASTER
// (transparente p/ não-MASTER).
// =============================================================================

import { StoreAreaGate } from '@/components/common/StoreAreaGate'

export default function SimulacoesLayout({ children }: { children: React.ReactNode }) {
  return <StoreAreaGate area="as Simulações">{children}</StoreAreaGate>
}
