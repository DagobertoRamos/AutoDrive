// =============================================================================
// Dashboard Layout (server) — AutoDrive
//
// Todas as páginas do grupo (dashboard) dependem da sessão do usuário e nunca
// devem ser pré-renderizadas estaticamente. Forçamos `dynamic = 'force-dynamic'`
// no layout pai para que o Next pule a etapa de SSG (que falha com
// `TypeError: Invalid URL` em bundles client durante o build).
// =============================================================================

import DashboardShell from './DashboardShell'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardShell>{children}</DashboardShell>
}
