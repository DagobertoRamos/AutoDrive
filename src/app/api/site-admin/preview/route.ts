// =============================================================================
// POST /api/site-admin/preview — guarda a config EM EDIÇÃO como rascunho de
// pré-visualização (60 min) e devolve o endereço para abrir. Não altera o site
// publicado. Gate: site.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadSiteConfig } from '@/lib/site/config'
import { sanitizeSiteConfig } from '@/lib/site/config-core'
import { PREVIEW_COOKIE, PREVIEW_TTL_MS, savePreview } from '@/lib/site/preview'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site.manage')) return forbiddenResponse('Sem permissão para editar o site.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const current = await loadSiteConfig(tenantId)
  // O painel não manda banners/depoimentos/catálogo/e-mails: usa os salvos.
  const merged = { ...current, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== null)) }
  const draft = sanitizeSiteConfig(merged, current.identity.name)
  // Endereço e domínios não mudam na prévia (é sempre /s/<slug salvo>).
  const config = { ...draft, slug: current.slug, domains: current.domains }
  const token = await savePreview(tenantId, config, user.id)

  const res = NextResponse.json({ success: true, url: `/s/${current.slug}` })
  res.cookies.set(PREVIEW_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: Math.floor(PREVIEW_TTL_MS / 1000) })
  return res
}

/** Sai da pré-visualização (apaga o cookie). */
export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(PREVIEW_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0 })
  return res
}
