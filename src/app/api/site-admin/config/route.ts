// =============================================================================
// Painel do Site — configuração do site da loja.
//   GET : config efetiva + resumo da vitrine. Gate: site.
//   PUT : grava (slug/domínios únicos entre lojas). Gate: site.manage.
//   PATCH: grava só as partes enviadas (banners, depoimentos, catálogo, e-mails, serviços). Gate: site.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadSiteConfig, saveSiteConfig, SiteConfigError, SITE_SERVICES } from '@/lib/site/config'
import { SITE_VISIBLE_STOCK } from '@/lib/site/listing-core'
import { pruneUnusedBanners } from '@/lib/site/assets'

export const dynamic = 'force-dynamic'

async function vitrine(tenantId: string) {
  const where = { tenantId, active: true, stockStatus: { in: [...SITE_VISIBLE_STOCK] } }
  const [total, published] = await Promise.all([
    prisma.vehicle.count({ where: { ...where, OR: [{ siteListing: { is: null } }, { siteListing: { is: { hidden: false } } }] } }),
    prisma.vehicle.count({ where: { ...where, photos: { some: {} }, OR: [{ siteListing: { is: null } }, { siteListing: { is: { hidden: false } } }] } }),
  ]).catch(() => [0, 0])
  return { total, published, comingSoon: total - published }
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site')) return forbiddenResponse('Sem acesso ao site da loja.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const [config, stats] = await Promise.all([loadSiteConfig(tenantId), vitrine(tenantId)])
  return NextResponse.json({
    success: true,
    data: {
      config, services: SITE_SERVICES, stats,
      canManage: await canAccessModuleForUser(user, 'site.manage'),
      siteBaseDomain: process.env.SITE_BASE_DOMAIN || null,
      hostingIntegration: Boolean(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID),
    },
  })
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site.manage')) return forbiddenResponse('Sem permissão para configurar o site.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const before = await loadSiteConfig(tenantId)
    // Domínios têm rotas próprias (status verificado): o salvar geral não os sobrescreve.
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    // Banners, depoimentos e catálogo têm tela própria (PATCH): se não vierem, ficam como estão.
    const saved = await saveSiteConfig(tenantId, { banners: before.banners, testimonials: before.testimonials, catalog: before.catalog, emails: before.emails, ...body, domains: before.domains }, user.id)
    await pruneUnusedBanners(tenantId, saved.banners.items.map((b) => b.imageUrl))
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SiteConfig', entityId: tenantId, userName: user.name, userRole: user.role, beforeData: before, afterData: saved })
    return NextResponse.json({ success: true, data: saved })
  } catch (err) {
    if (err instanceof SiteConfigError) return NextResponse.json({ success: false, error: err.message }, { status: 409 })
    return handlePrismaError(err)
  }
}

const PATCHABLE = ['banners', 'testimonials', 'catalog', 'emails'] as const

export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site.manage')) return forbiddenResponse('Sem permissão para configurar o site.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const before = await loadSiteConfig(tenantId)
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const k of PATCHABLE) if (k in body) patch[k] = body[k]
    if (body.services && typeof body.services === 'object') patch.services = { ...before.services, ...body.services as object }
    const saved = await saveSiteConfig(tenantId, { ...before, ...patch }, user.id)
    await pruneUnusedBanners(tenantId, saved.banners.items.map((b) => b.imageUrl))
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SiteConfig', entityId: tenantId, userName: user.name, userRole: user.role, beforeData: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof typeof before]])), afterData: patch })
    return NextResponse.json({ success: true, data: saved })
  } catch (err) {
    if (err instanceof SiteConfigError) return NextResponse.json({ success: false, error: err.message }, { status: 409 })
    return handlePrismaError(err)
  }
}
