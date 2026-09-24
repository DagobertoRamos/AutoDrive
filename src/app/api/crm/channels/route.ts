// =============================================================================
// CRM — Canais de captação da loja.
//   GET : canais + catálogo + registro recente + URL base. Gate: crm.settings.manage
//         (a URL de entrada é segredo: quem tem, cria lead).
//   PUT : substitui a lista de canais. Gate: crm.settings.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadChannelLog, loadChannels, saveChannels } from '@/lib/crm/channels'
import { CHANNEL_CATALOG, CHANNEL_GROUP_LABEL } from '@/lib/crm/channels-core'

export const dynamic = 'force-dynamic'

async function gate(req: Request) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return { error: forbiddenResponse('Sem permissão para configurar o CRM.') }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(user)) }
  return { user, tenantId }
}

export async function GET(req: Request) {
  const g = await gate(req)
  if ('error' in g) return g.error
  const [channels, log] = await Promise.all([loadChannels(g.tenantId), loadChannelLog(g.tenantId)])
  return NextResponse.json({
    success: true,
    data: { channels, log: log.slice(0, 150), catalog: CHANNEL_CATALOG, groups: CHANNEL_GROUP_LABEL, baseUrl: `${new URL(req.url).origin}/api/integrations/leads/` },
  })
}

export async function PUT(req: Request) {
  const g = await gate(req)
  if ('error' in g) return g.error
  try {
    const body = await req.json().catch(() => ({})) as { channels?: unknown }
    const before = await loadChannels(g.tenantId)
    const saved = await saveChannels(g.tenantId, body.channels, g.user.id)
    // Auditoria sem as chaves (são segredo).
    const strip = (l: typeof saved) => l.map(({ key: _k, secret: _s, ...rest }) => rest)
    await createSafeAuditLog({
      userId: g.user.id, tenantId: g.tenantId, action: 'UPDATE', entity: 'CrmChannels', entityId: g.tenantId,
      userName: g.user.name, userRole: g.user.role, beforeData: strip(before), afterData: strip(saved),
    })
    return NextResponse.json({ success: true, data: saved })
  } catch (err) {
    return handlePrismaError(err)
  }
}
