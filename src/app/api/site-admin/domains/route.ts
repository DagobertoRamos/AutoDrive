// =============================================================================
// Painel do Site — domínios próprios. Gate: site.manage.
//   POST   { domain }  : adiciona (raiz + www quando for o caso) e já verifica
//   PATCH  { primary } : define o domínio principal (os outros redirecionam)
//   DELETE ?host=      : remove
// =============================================================================

import { NextResponse } from 'next/server'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadSiteConfig, saveSiteConfig, SiteConfigError } from '@/lib/site/config'
import { cleanDomainInput, expectedRecords, suggestHosts, type SiteDomain } from '@/lib/site/domains-core'
import { dnsTargetsFromEnv, refreshSiteDomains, removeHostingDomain, setHostingRedirect } from '@/lib/site/domains'

export const dynamic = 'force-dynamic'

async function guard(req: Request) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() } as const
  if (!await canAccessModuleForUser(user, 'site.manage')) return { error: forbiddenResponse('Sem permissão para configurar o site.') } as const
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(user)) } as const
  return { user, tenantId } as const
}

export async function POST(req: Request) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const body = await req.json().catch(() => ({})) as { domain?: string }
  const sug = suggestHosts(String(body.domain ?? ''))
  if ('error' in sug) return NextResponse.json({ success: false, error: sug.error }, { status: 400 })
  try {
    const cfg = await loadSiteConfig(g.tenantId)
    const targets = dnsTargetsFromEnv()
    const fresh = sug.hosts.filter((h) => !cfg.domains.some((d) => d.host === h))
    if (!fresh.length) return NextResponse.json({ success: false, error: 'Esse domínio já está cadastrado.' }, { status: 409 })
    if (cfg.domains.length + fresh.length > 10) return NextResponse.json({ success: false, error: 'Limite de 10 domínios por site.' }, { status: 400 })
    const hasPrimary = cfg.domains.some((d) => d.primary)
    const added: SiteDomain[] = fresh.map((host) => ({
      host, primary: !hasPrimary && host === sug.primary, status: 'PENDING_DNS', records: expectedRecords(host, targets),
      message: 'Cadastre o registro abaixo no seu provedor de domínio e clique em “Verificar agora”.',
    }))
    const saved = await saveSiteConfig(g.tenantId, { ...cfg, domains: [...cfg.domains, ...added] }, g.user.id)
    let result = saved
    for (const d of added) result = await refreshSiteDomains(g.tenantId, g.user.id, result, d.host)
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'CREATE', entity: 'SiteDomain', entityId: sug.primary, userName: g.user.name, userRole: g.user.role, afterData: { hosts: fresh } })
    return NextResponse.json({ success: true, data: result.domains })
  } catch (err) {
    if (err instanceof SiteConfigError) return NextResponse.json({ success: false, error: err.message }, { status: 409 })
    return handlePrismaError(err)
  }
}

export async function PATCH(req: Request) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const body = await req.json().catch(() => ({})) as { primary?: string }
  const host = cleanDomainInput(String(body.primary ?? ''))
  try {
    const cfg = await loadSiteConfig(g.tenantId)
    if (!cfg.domains.some((d) => d.host === host)) return NextResponse.json({ success: false, error: 'Domínio não encontrado.' }, { status: 404 })
    const domains = cfg.domains.map((d) => ({ ...d, primary: d.host === host }))
    const saved = await saveSiteConfig(g.tenantId, { ...cfg, domains }, g.user.id)
    for (const d of domains) await setHostingRedirect(d.host, d.primary ? null : host)
    return NextResponse.json({ success: true, data: saved.domains })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const host = cleanDomainInput(new URL(req.url).searchParams.get('host') ?? '')
  try {
    const cfg = await loadSiteConfig(g.tenantId)
    if (!cfg.domains.some((d) => d.host === host)) return NextResponse.json({ success: false, error: 'Domínio não encontrado.' }, { status: 404 })
    const saved = await saveSiteConfig(g.tenantId, { ...cfg, domains: cfg.domains.filter((d) => d.host !== host) }, g.user.id)
    await removeHostingDomain(host)
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'DELETE', entity: 'SiteDomain', entityId: host, userName: g.user.name, userRole: g.user.role })
    return NextResponse.json({ success: true, data: saved.domains })
  } catch (err) {
    return handlePrismaError(err)
  }
}
