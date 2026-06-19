// =============================================================================
// Layout de Configurações › Loja — área da loja: gate de "loja ativa" do MASTER
// (transparente p/ não-MASTER).
// =============================================================================

import { StoreAreaGate } from '@/components/common/StoreAreaGate'

export default function LojaConfigLayout({ children }: { children: React.ReactNode }) {
  return <StoreAreaGate area="a Loja">{children}</StoreAreaGate>
}
