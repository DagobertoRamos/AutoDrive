// =============================================================================
// Raiz "/" — AutoDrive
// Sem o middleware: usuário não autenticado é mandado para /login; autenticado
// cai aqui e é redirecionado para o dashboard. Evita o 404 ao digitar o
// domínio puro (ex.: auto-drive-mocha.vercel.app) ou ao voltar após o login.
// =============================================================================

import { redirect } from 'next/navigation'

// Não pré-renderizar no build (o layout raiz toca next-auth, que quebra na
// geração estática). Em runtime apenas redireciona.
export const dynamic = 'force-dynamic'

export default function RootPage() {
  redirect('/dashboard')
}
