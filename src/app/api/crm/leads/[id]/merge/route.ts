// =============================================================================
// POST /api/crm/leads/[id]/merge — Unifica o lead [id] (principal) com um
// lead secundário. O secundário é marcado DISCARDED + metadata.mergedInto.
// Todas as tarefas, interações, tags e deals do secundário migram para o
// principal. Auditado. Gate: crm.lead.merge.
// Body: { secondaryLeadId, reason }
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { resolveCrmScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id: primaryId } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.lead.merge')) return forbiddenResponse('Sem permissão para unificar leads.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const b = await req.json().catch(() => ({}))
    const secondaryId = String(b?.secondaryLeadId ?? '').trim()
    const reason      = String(b?.reason ?? '').trim()
    if (!secondaryId) return NextResponse.json({ success: false, error: 'Informe o lead secundário (secondaryLeadId).' }, { status: 400 })
    if (!reason)      return NextResponse.json({ success: false, error: 'Informe o motivo da unificação.' }, { status: 400 })
    if (primaryId === secondaryId) return NextResponse.json({ success: false, error: 'Lead principal e secundário são o mesmo.' }, { status: 400 })

    const [primary, secondary] = await Promise.all([
      prisma.marketingLead.findFirst({ where: { id: primaryId, tenantId } }),
      prisma.marketingLead.findFirst({ where: { id: secondaryId, tenantId } }),
    ])
    if (!primary)   return NextResponse.json({ success: false, error: 'Lead principal não encontrado.' }, { status: 404 })
    if (!secondary) return NextResponse.json({ success: false, error: 'Lead secundário não encontrado.' }, { status: 404 })
    const secMeta = (secondary.metadata && typeof secondary.metadata === 'object') ? secondary.metadata as Record<string,unknown> : {}
    if (secMeta.mergedInto) return NextResponse.json({ success: false, error: 'O lead secundário já foi unificado anteriormente.' }, { status: 409 })

    const scope = await resolveCrmScope(user)
    if (!scope) return forbiddenResponse('Sem acesso aos leads.')

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      // Migra tarefas.
      await tx.marketingLeadTask.updateMany({ where: { leadId: secondaryId }, data: { leadId: primaryId } })
      // Migra etiquetas (evita duplicidade).
      const secTags = await tx.crmLeadTag.findMany({ where: { leadId: secondaryId }, select: { tagId: true, tenantId: true, createdByUserId: true } }).catch(() => [])
      const primTagIds = new Set((await tx.crmLeadTag.findMany({ where: { leadId: primaryId }, select: { tagId: true } }).catch(() => [])).map(t => t.tagId))
      await Promise.all(secTags.filter(t => !primTagIds.has(t.tagId)).map(t =>
        tx.crmLeadTag.create({ data: { tenantId, leadId: primaryId, tagId: t.tagId, createdByUserId: user.id } })
      ))
      await tx.crmLeadTag.deleteMany({ where: { leadId: secondaryId } }).catch(() => {})
      // Migra interações, visitas, veículos, deals (tabelas satélite Fase A).
      await tx.crmLeadInteraction.updateMany({ where: { leadId: secondaryId }, data: { leadId: primaryId } }).catch(() => {})
      await tx.crmLeadVisit.updateMany({ where: { leadId: secondaryId }, data: { leadId: primaryId } }).catch(() => {})
      await tx.crmLeadVehicle.updateMany({ where: { leadId: secondaryId }, data: { leadId: primaryId } }).catch(() => {})
      await tx.crmLeadSummary.updateMany({ where: { leadId: secondaryId }, data: { leadId: primaryId } }).catch(() => {})
      // Deals: só os que não conflitem.
      const secDeals = await tx.crmLeadDeal.findMany({ where: { leadId: secondaryId } }).catch(() => [])
      const primDealIds = new Set((await tx.crmLeadDeal.findMany({ where: { leadId: primaryId }, select: { dealId: true } }).catch(() => [])).map(d => d.dealId))
      await Promise.all(secDeals.filter(d => !primDealIds.has(d.dealId)).map(d =>
        tx.crmLeadDeal.create({ data: { tenantId, leadId: primaryId, dealId: d.dealId, isPrimary: false, linkedByUserId: user.id } }).catch(() => {})
      ))
      await tx.crmLeadDeal.deleteMany({ where: { leadId: secondaryId } }).catch(() => {})
      // Candidatos a merge.
      await tx.crmMergeCandidate.updateMany({ where: { leadId: secondaryId }, data: { status: 'MERGED', resolvedByUserId: user.id, resolvedAt: now } }).catch(() => {})
      await tx.crmMergeCandidate.updateMany({ where: { matchedLeadId: secondaryId }, data: { status: 'MERGED', resolvedByUserId: user.id, resolvedAt: now } }).catch(() => {})
      // Marca o secundário como unificado.
      await tx.marketingLead.update({ where: { id: secondaryId }, data: {
        status: 'DISCARDED' as never,
        metadata: { ...secMeta, mergedInto: primaryId, mergedAt: now.toISOString(), mergedBy: user.id, mergeReason: reason, originalLeadNumber: (secondary as { leadNumber?: number | null }).leadNumber } as never,
      }})
      // Registra interação no lead principal.
      await tx.crmLeadInteraction.create({ data: { tenantId, leadId: primaryId, type: 'NOTE', result: 'MERGED', summary: `Lead unificado com #${secondaryId.slice(-8)} — ${reason}`, authorId: user.id, authorName: user.name, occurredAt: now }})
    })

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'MERGE', entity: 'MarketingLead', entityId: primaryId, userName: user.name, userRole: user.role, afterData: { secondaryId, reason } })
    return NextResponse.json({ success: true, data: { primaryId, secondaryId, mergedAt: now } })
  } catch (err) { return handlePrismaError(err) }
}

// GET — preview do que será unificado (antes de confirmar).
export async function GET(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id: primaryId } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.lead.merge')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const secondaryId = new URL(req.url).searchParams.get('secondaryLeadId')
  if (!secondaryId) return NextResponse.json({ success: false, error: 'Informe secondaryLeadId.' }, { status: 400 })
  try {
    const [primary, secondary, tasks, interactions] = await Promise.all([
      prisma.marketingLead.findFirst({ where: { id: primaryId, tenantId }, select: { id: true, name: true, phone: true, email: true, status: true } }),
      prisma.marketingLead.findFirst({ where: { id: secondaryId, tenantId }, select: { id: true, name: true, phone: true, email: true, status: true, metadata: true } }),
      prisma.marketingLeadTask.count({ where: { leadId: secondaryId } }).catch(() => 0),
      prisma.crmLeadInteraction.count({ where: { leadId: secondaryId } }).catch(() => 0),
    ])
    if (!primary || !secondary) return NextResponse.json({ success: false, error: 'Um dos leads não foi encontrado.' }, { status: 404 })
    const secMeta = (secondary.metadata && typeof secondary.metadata === 'object') ? secondary.metadata as Record<string,unknown> : {}
    return NextResponse.json({ success: true, data: { primary, secondary, willMove: { tasks, interactions }, alreadyMerged: !!secMeta.mergedInto } })
  } catch (err) { return handlePrismaError(err) }
}
