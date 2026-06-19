// =============================================================================
// Layout de Configurações › F&I — área da loja: gate de "loja ativa" do MASTER
// (transparente p/ não-MASTER). Observação: a sub-tela de Credenciais permanece
// bloqueada ao MASTER por regra BYOC, independentemente do gate.
// =============================================================================

import { StoreAreaGate } from '@/components/common/StoreAreaGate'

export default function FiConfigLayout({ children }: { children: React.ReactNode }) {
  return <StoreAreaGate area="o F&I da loja">{children}</StoreAreaGate>
}
