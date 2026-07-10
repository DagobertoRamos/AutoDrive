// =============================================================================
// CRM F1 — Temperatura do LEAD (HOT/WARM/COLD/UNCLASSIFIED). PATCH { temperature }.
// Guardada em MarketingLead.metadata.temperature (sem coluna nova). Gate: crm +
// escopo do lead. Registra quem/quando setou.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { resolveCrmScope, canAccessLeadByScope } from '@/lib/crm/shared'
import { isValidTemperature } from '@/lib/crm/config'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const scope = await resolveCrmScope(user)
  if (!scope) return forbiddenResponse('Sem acesso aos leads.')

  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true, metadata: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    if (!canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const temperature = String((await req.json().catch(() => ({})))?.temperature ?? '')
    if (!isValidTemperature(temperature)) return NextResponse.json({ success: false, error: 'Temperatura inválida.' }, { status: 400 })

    const meta = (lead.metadata && typeof lead.metadata === 'object' && !Array.isArray(lead.metadata) ? lead.metadata : {}) as Record<string, unknown>
    const nextMeta = { ...meta, temperature, temperatureSetAt: new Date().toISOString(), temperatureSetBy: user.id }
    await prisma.marketingLead.update({ where: { id }, data: { metadata: nextMeta as Prisma.InputJsonValue } })
    return NextResponse.json({ success: true, data: { temperature } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
