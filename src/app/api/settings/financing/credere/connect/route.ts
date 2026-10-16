// GET /api/settings/financing/credere/connect — leva a loja ao login da Credere
// (OAuth). Volta em /callback com o código. financing.config + loja ativa.
import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { authorizeUrl, signState } from '@/lib/finance/fi/gateway/credere-oauth'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem acesso às configurações de F&I.')
  { const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const origin = (process.env.NEXTAUTH_URL || new URL(req.url).origin).replace(/\/+$/, '')
  const url = authorizeUrl(origin, signState(tenantId, user.id))
  if (!url) return NextResponse.redirect(`${origin}/configuracoes/fi/integracoes?credere=sem-app`)
  return NextResponse.redirect(url)
}
