// =============================================================================
// POST /api/crm/leads/[id]/pendency — cria uma pendência na Central de Pendências
// vinculada ao lead. Usada para agendar visita, follow-up, alimentação do sistema.
// Body: { type, title, description, dueDate, priority?, frequency?, maxSends? }
// Tipos sugeridos: VISITA_AGENDADA | FOLLOWUP | ALIMENTAR_SISTEMA | ACOMPANHAMENTO
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, name: true, phone: true, assignedToUserId: true, unitId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const b = await req.json().catch(() => ({}))
    const title       = String(b?.title ?? '').trim()
    const description = String(b?.description ?? '').trim()
    const type        = String(b?.type ?? 'FOLLOWUP').trim()
    const dueDate     = b?.dueDate ? new Date(b.dueDate) : null
    if (!title) return NextResponse.json({ success: false, error: 'Informe o título da pendência.' }, { status: 400 })

    // Resolve o responsável: usa o seller vinculado ao assignedToUserId
    const seller = await prisma.seller.findFirst({ where: { userId: lead.assignedToUserId ?? user.id }, select: { id: true } }).catch(() => null)
    if (!seller) return NextResponse.json({ success: false, error: 'Vendedor responsável não tem cadastro de vendedor. Verifique o cadastro.' }, { status: 400 })

    const priority = ['URGENTE','ALTA','MEDIA','BAIXA'].includes(String(b?.priority)) ? String(b.priority) : 'MEDIA'

    const pendency = await prisma.pendency.create({ data: {
      tenantId,
      unitId: lead.unitId ?? user.unitId ?? '',
      responsibleId: seller.id,
      customerName: lead.name ?? lead.phone ?? 'Lead CRM',
      description: description || title,
      type,
      priority: priority as never,
      status: 'ABERTA',
      dueDate,
      // Vincula ao lead via metadata
      originModule: 'CRM',
      originRecordId: id,
      source: 'MANUAL',
      allowedDays: [],
      automaticSend: Boolean(b?.remind),
      frequency: b?.frequency ? String(b.frequency) : null,
      maxSends: b?.maxSends ? Number(b.maxSends) : null,
      nextSendAt: Boolean(b?.remind) ? new Date() : null,
      notes: `Lead CRM: ${lead.name ?? ''}${lead.phone ? ' · ' + lead.phone : ''}`,
    }})

    // Registra interação no lead para aparecer no histórico.
    await prisma.crmLeadInteraction.create({ data: { tenantId, leadId: id, type: 'NOTE', result: 'PENDING_CREATED', summary: `Pendência criada: ${title}${dueDate ? ' — vence em ' + dueDate.toLocaleDateString('pt-BR') : ''}`, authorId: user.id, authorName: user.name, occurredAt: new Date() }}).catch(() => {})

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'Pendency', entityId: pendency.id, userName: user.name, userRole: user.role, afterData: { leadId: id, type, title } })
    return NextResponse.json({ success: true, data: { id: pendency.id, type, title, dueDate } }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}

export async function GET(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const pendencies = await prisma.pendency.findMany({
      where: { tenantId, originModule: 'CRM', originRecordId: id },
      select: { id: true, type: true, status: true, priority: true, dueDate: true, description: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 20,
    }).catch(() => [])
    return NextResponse.json({ success: true, data: pendencies })
  } catch (err) { return handlePrismaError(err) }
}
