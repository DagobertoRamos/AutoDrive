// =============================================================================
// Layout de Comercial › Fila de Atendimento — área da loja/unidade: gate de
// "loja ativa" do MASTER (transparente p/ não-MASTER). A unidade vem do usuário
// (vendedor/líder/gerente têm unitId); o MASTER pode informar ?unitId nas telas.
// =============================================================================

import { StoreAreaGate } from '@/components/common/StoreAreaGate'
import { SellerQueueUnitBar } from '@/components/seller-queue/SellerQueueUnitBar'

export default function VendedorDaVezLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreAreaGate area="a Fila de Atendimento">
      <SellerQueueUnitBar />
      {children}
    </StoreAreaGate>
  )
}
