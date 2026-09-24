// =============================================================================
// CRM — trilha de auditoria (aba Auditoria da Central de Configurações).
// Lê o AuditLog da loja filtrado às entidades do CRM. Gate: crm.settings.manage.
// Query: entity, action, userId, leadId, from, to (YYYY-MM-DD), page, perPage.
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

const CRM_AUDIT_ENTITIES = ['MarketingLead', 'MarketingLeadTask', 'CrmLeadVisit', 'CrmPipeline', 'CrmSettings', 'CrmAutomation', 'CrmTag', 'CrmStage']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão para ver a auditoria do CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const sp = new URL(req.url).searchParams
    const page = Math.max(1, Number(sp.get('page') ?? 1))
    const perPage = Math.min(100, Math.max(10, Number(sp.get('perPage') ?? 30)))
    const entity = sp.get('entity')?.trim()
    const action = sp.get('action')?.trim()
    const userId = sp.get('userId')?.trim()
    const leadId = sp.get('leadId')?.trim()
    const from = sp.get('from')?.trim()
    const to = sp.get('to')?.trim()

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      entity: entity && CRM_AUDIT_ENTITIES.includes(entity) ? entity : { in: CRM_AUDIT_ENTITIES },
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(userId === 'system' ? { userId: null } : userId ? { userId } : {}),
      ...(leadId ? { entityId: leadId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}) } } : {}),
    }

    const [total, rows, actors] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage,
        select: { id: true, createdAt: true, action: true, entity: true, entityId: true, userId: true, userName: true, userRole: true, status: true, beforeData: true, afterData: true },
      }),
      prisma.auditLog.groupBy({ by: ['userId', 'userName'], where: { tenantId, entity: { in: CRM_AUDIT_ENTITIES } }, _count: { _all: true } }),
    ])

    // Nome do lead p/ as linhas de lead (lote, sem N+1).
    const leadIds = [...new Set(rows.filter((r) => r.entity === 'MarketingLead' || r.entity === 'CrmAutomation').map((r) => r.entityId).filter((x): x is string => !!x))]
    const leads = leadIds.length ? await prisma.marketingLead.findMany({ where: { id: { in: leadIds }, tenantId }, select: { id: true, name: true, phone: true } }) : []
    const leadName = new Map(leads.map((l) => [l.id, l.name || l.phone || null]))

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({ ...r, leadName: r.entityId ? leadName.get(r.entityId) ?? null : null })),
      meta: {
        total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)),
        entities: CRM_AUDIT_ENTITIES,
        actors: actors.map((a) => ({ userId: a.userId ?? 'system', name: a.userName ?? (a.userId ? a.userId : 'Sistema') })),
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
