// =============================================================================
// /comissoes — a tela antiga consumia rotas /api/commissions/* que não existem
// mais (sales, purchases, bonus, summary…). O módulo vive em /comissoes/extrato,
// o mesmo destino do menu "Meu Extrato".
// =============================================================================

import { redirect } from 'next/navigation'

export default function ComissoesPage() {
  redirect('/comissoes/extrato')
}
