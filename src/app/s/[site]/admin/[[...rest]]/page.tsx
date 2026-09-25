// =============================================================================
// /admin no domínio da loja → painel admin do site de ORIGEM (feed importado).
// Depois do cutover (www.appautodrive.com.br virou o site do SaaS), o /admin
// antigo passou a dar 404. Enquanto a loja importa o estoque do site antigo, o
// admin dele continua sendo onde se cadastram placas, parceiros e fotos.
// Loja sem site de origem → 404 normal.
// =============================================================================

import { notFound, redirect } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { legacyAdminOrigin } from '@/lib/site/feed-import'

export const dynamic = 'force-dynamic'

export default async function LegacyAdminRedirect({ params }: { params: Promise<{ site: string; rest?: string[] }> }) {
  const { site, rest } = await params
  const ctx = await getSiteContext(site)
  const origin = legacyAdminOrigin(ctx.tenantId)
  if (!origin) notFound()
  redirect(`${origin}/admin${rest?.length ? `/${rest.map(encodeURIComponent).join('/')}` : ''}`)
}
