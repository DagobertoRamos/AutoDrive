// =============================================================================
// Raiz "/" — AutoDrive
// Sem o middleware: usuário não autenticado é mandado para /login; autenticado
// cai aqui e é redirecionado para o dashboard. Evita o 404 ao digitar o
// domínio puro (ex.: auto-drive-mocha.vercel.app) ou ao voltar após o login.
// =============================================================================

import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/dashboard')
}
