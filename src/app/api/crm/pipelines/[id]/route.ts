// =============================================================================
// CRM Pipelines — edição/exclusão de um funil. Gate: crm.settings.manage.
//   PUT    : salva nome/descrição/cor/ativo + etapas (ordem = ordem do array).
//            Etapa com id existente é atualizada; sem id é criada; ausente é
//            removida (leads nela voltam a ter a etapa derivada do status).
//            id "default" = funil padrão virtual → é gravado nesse momento.
//   DELETE : exclui funil (não o padrão). Leads dele voltam ao funil padrão.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadPipelines, materializeDefaultPipeline, sanitizePipelineInput, VIRTUAL_PIPELINE_ID } from '@/lib/crm/pipelines'

export const dynamic = 'force-dynamic'

async function guard(req: Request) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() } as const
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return { error: forbiddenResponse('Sem permissão para configurar o CRM.') } as const
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(user)) } as const
  return { user, tenantId } as const
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const { user, tenantId } = g

  const parsed = sanitizePipelineInput(await req.json().catch(() => ({})))
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
  const input = parsed.value

  try {
    const defaultId = await materializeDefaultPipeline(tenantId)
    const { id: rawId } = await params
    const id = rawId === VIRTUAL_PIPELINE_ID ? defaultId : rawId
    const pipeline = await prisma.crmPipeline.findFirst({ where: { id, tenantId }, include: { stages: { select: { id: true } } } })
    if (!pipeline) return NextResponse.json({ success: false, error: 'Funil não encontrado.' }, { status: 404 })
    if (pipeline.isDefault && !input.active) {
      return NextResponse.json({ success: false, error: 'O funil principal não pode ser desativado.' }, { status: 409 })
    }

    // Ids vindos do funil virtual ("status:NEW") não existem aqui → viram etapas
    // novas. Por isso o 1º salvamento do padrão casa por statusCode+ordem.
    const existing = await prisma.crmPipelineStage.findMany({ where: { pipelineId: id }, orderBy: { order: 'asc' }, select: { id: true, statusCode: true } })
    const existingIds = new Set(existing.map((s) => s.id))
    const claimed = new Set<string>()
    const resolvedIds = input.stages.map((s) => {
      if (s.id && existingIds.has(s.id)) { claimed.add(s.id); return s.id }
      if (s.id?.startsWith('status:')) {
        const match = existing.find((e) => !claimed.has(e.id) && `status:${e.statusCode}` === s.id)
        if (match) { claimed.add(match.id); return match.id }
      }
      return null
    })

    await prisma.$transaction(async (tx) => {
      await tx.crmPipeline.update({
        where: { id },
        data: { name: input.name, description: input.description, color: input.color, active: input.active },
      })
      const removed = [...existingIds].filter((x) => !claimed.has(x))
      if (removed.length) await tx.crmPipelineStage.deleteMany({ where: { id: { in: removed }, pipelineId: id } })
      for (const [order, s] of input.stages.entries()) {
        const data = {
          name: s.name, color: s.color, order, active: s.active, statusCode: s.statusCode,
          requiredFields: s.requiredFields, allowSkip: s.allowSkip, allowBack: s.allowBack,
        }
        const stageId = resolvedIds[order]
        if (stageId) await tx.crmPipelineStage.update({ where: { id: stageId }, data })
        else await tx.crmPipelineStage.create({ data: { ...data, tenantId, pipelineId: id } })
      }
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'CrmPipeline', entityId: id, userName: user.name, userRole: user.role })
    const pipelines = await loadPipelines(tenantId)
    return NextResponse.json({ success: true, data: pipelines.find((p) => p.id === id) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const { user, tenantId } = g

  try {
    const { id } = await params
    const pipeline = await prisma.crmPipeline.findFirst({ where: { id, tenantId }, select: { id: true, isDefault: true } })
    if (!pipeline) return NextResponse.json({ success: false, error: 'Funil não encontrado.' }, { status: 404 })
    if (pipeline.isDefault) return NextResponse.json({ success: false, error: 'O funil principal não pode ser excluído.' }, { status: 409 })
    // Placements caem em cascata → os leads voltam ao funil padrão.
    const movedLeads = await prisma.crmLeadPlacement.count({ where: { pipelineId: id } })
    await prisma.crmPipeline.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'DELETE', entity: 'CrmPipeline', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { movedLeads } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
