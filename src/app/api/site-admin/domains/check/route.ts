// POST /api/site-admin/domains/check { host? } — "Verificar agora" (um ou todos). Gate: site.manage.
import { NextResponse } from 'next/server'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadSiteConfig } from '@/lib/site/config'
import { cleanDomainInput } from '@/lib/site/domains-core'
import { refreshSiteDomains } from '@/lib/site/domains'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site.manage')) return forbiddenResponse('Sem permissão para configurar o site.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const body = await req.json().catch(() => ({})) as { host?: string }
  try {
    const cfg = await loadSiteConfig(tenantId)
    const host = body.host ? cleanDomainInput(body.host) : undefined
    const saved = await refreshSiteDomains(tenantId, user.id, cfg, host)
    return NextResponse.json({ success: true, data: saved.domains })
  } catch (err) {
    return handlePrismaError(err)
  }
}
