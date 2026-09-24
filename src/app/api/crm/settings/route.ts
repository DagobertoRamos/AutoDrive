// =============================================================================
// CRM — listas configuráveis (temperaturas, tipos de lead, origens, motivos).
//   GET : configurações efetivas da loja. Gate: crm.
//   PUT : substitui as seções enviadas. Gate: crm.settings.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadCrmSettings, saveCrmSettings } from '@/lib/crm/settings'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  return NextResponse.json({ success: true, data: await loadCrmSettings(tenantId) })
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão para configurar o CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    // Salvar uma aba não pode apagar as outras: mescla com o que já existe.
    const current = await loadCrmSettings(tenantId)
    const before = { ...current }
    const merged: Record<string, unknown> = { ...current, ...Object.fromEntries(Object.entries(body).filter(([k]) => k in current)) }
    // SLA: carimba quando foi ligado (a varredura ignora estouros anteriores).
    const nextSla = merged.sla as Record<string, unknown> | undefined
    if (nextSla?.enabled) {
      merged.sla = { ...nextSla, enabledAt: current.sla.enabled && current.sla.enabledAt ? current.sla.enabledAt : new Date().toISOString() }
    }
    const saved = await saveCrmSettings(tenantId, merged, user.id)
    await createSafeAuditLog({
      userId: user.id, tenantId, action: 'UPDATE', entity: 'CrmSettings', entityId: tenantId,
      userName: user.name, userRole: user.role, beforeData: before, afterData: saved,
    })
    return NextResponse.json({ success: true, data: saved })
  } catch (err) {
    return handlePrismaError(err)
  }
}
