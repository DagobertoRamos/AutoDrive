// =============================================================================
// CRM Config F1 — Etapas.
//   GET : lista as etapas efetivas (defaults + overrides do tenant). Gate: crm.
//   PUT : salva nome/cor/ordem/ativo por etapa. Gate: crm.settings.manage.
// Os CÓDIGOS (LeadStatus) são imutáveis — só o nome exibido/cor/ordem/ativo mudam.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadStages, defaultStages, CRM_REQUIRABLE_FIELDS } from '@/lib/crm/config'

export const dynamic = 'force-dynamic'

const VALID_CODES = new Set(defaultStages().map((s) => s.code))
const VALID_FIELDS = new Set<string>(CRM_REQUIRABLE_FIELDS.map((f) => f.key))

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  return NextResponse.json({ success: true, data: await loadStages(tenantId) })
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão para configurar o CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const body = await req.json().catch(() => ({}))
    const stages = Array.isArray(body?.stages) ? body.stages : []
    for (const s of stages) {
      const code = String(s?.code ?? '')
      if (!VALID_CODES.has(code)) continue
      const displayName = String(s?.displayName ?? '').trim().slice(0, 60) || code
      const color = typeof s?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : null
      const order = Number.isFinite(Number(s?.order)) ? Math.max(0, Math.round(Number(s.order))) : 0
      const active = Boolean(s?.active ?? true)
      const requiredFields = Array.isArray(s?.requiredFields)
        ? s.requiredFields.filter((f: unknown): f is string => typeof f === 'string' && VALID_FIELDS.has(f))
        : []
      const allowSkip = Boolean(s?.allowSkip ?? true)
      const allowBack = Boolean(s?.allowBack ?? true)
      await prisma.crmStage.upsert({
        where: { tenantId_code: { tenantId, code } },
        create: { tenantId, code, displayName, color, order, active, requiredFields, allowSkip, allowBack },
        update: { displayName, color, order, active, requiredFields, allowSkip, allowBack },
      })
    }
    return NextResponse.json({ success: true, data: await loadStages(tenantId) })
  } catch (err) {
    return handlePrismaError(err)
  }
}
