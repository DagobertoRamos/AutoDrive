// =============================================================================
// Painel do Site — configuração do site da loja.
//   GET : config efetiva + resumo da vitrine. Gate: site.
//   PUT : grava (slug/domínios únicos entre lojas). Gate: site.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadSiteConfig, saveSiteConfig, SiteConfigError, SITE_SERVICES } from '@/lib/site/config'
import { SITE_VISIBLE_STOCK } from '@/lib/site/listing-core'

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
    const saved = await saveSiteConfig(tenantId, { ...body, domains: before.domains }, user.id)
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SiteConfig', entityId: tenantId, userName: user.name, userRole: user.role, beforeData: before, afterData: saved })
    return NextResponse.json({ success: true, data: saved })
  } catch (err) {
    if (err instanceof SiteConfigError) return NextResponse.json({ success: false, error: err.message }, { status: 409 })
    return handlePrismaError(err)
  }
}
