// =============================================================================
// CRM Pipelines — lista e criação de funis.
//   GET  : funis do tenant (o padrão pode ser VIRTUAL até o 1º salvamento). Gate: crm.
//   POST : cria funil com etapas livres. Gate: crm.settings.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadPipelines, materializeDefaultPipeline, sanitizePipelineInput } from '@/lib/crm/pipelines'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === '1'
  const pipelines = await loadPipelines(tenantId)
  return NextResponse.json({ success: true, data: includeInactive ? pipelines : pipelines.filter((p) => p.active) })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão para configurar o CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const parsed = sanitizePipelineInput(await req.json().catch(() => ({})))
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
  const input = parsed.value

  try {
    // Garante o funil padrão gravado antes de existir um segundo funil.
    await materializeDefaultPipeline(tenantId)
    const last = await prisma.crmPipeline.findFirst({ where: { tenantId }, orderBy: { order: 'desc' }, select: { order: true } })
    const created = await prisma.crmPipeline.create({
      data: {
        tenantId, name: input.name, description: input.description, color: input.color,
        active: input.active, isDefault: false, order: (last?.order ?? 0) + 1,
        stages: {
          create: input.stages.map((s, i) => ({
            tenantId, name: s.name, color: s.color, order: i, active: s.active, statusCode: s.statusCode,
            requiredFields: s.requiredFields, allowSkip: s.allowSkip, allowBack: s.allowBack,
          })),
        },
      },
      select: { id: true },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'CrmPipeline', entityId: created.id, userName: user.name, userRole: user.role })
    const pipelines = await loadPipelines(tenantId)
    return NextResponse.json({ success: true, data: pipelines.find((p) => p.id === created.id) }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
