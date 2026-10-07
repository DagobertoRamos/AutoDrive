// =============================================================================
// Layout do F&I — área da loja: o MASTER escolhe a loja ativa antes de operar
// (transparente para os demais perfis). O bloqueio real fica nas APIs.
// =============================================================================

import { StoreAreaGate } from '@/components/common/StoreAreaGate'

export default function FinanciamentoLayout({ children }: { children: React.ReactNode }) {
  return <StoreAreaGate area="o F&I">{children}</StoreAreaGate>
}
