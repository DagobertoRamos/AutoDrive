// =============================================================================
// /api/seller-queue/personal-queue — FILA INDIVIDUAL do vendedor/gerente.
//   GET  : sellerQueue.view — minha fila (?all=1 → toda a unidade, p/ gestão).
//   POST : sellerQueue.customerArrived — enfileira um item (agendamento/retorno/
//          pós-venda/outro) no responsável escolhido.
// Tenant/unit-scoped. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { isQueuePanelFallbackUser, resolveQueueUnitForRead, unitFromRequest } from '@/lib/seller-queue/queue'
import { assertModuleEnabled, canAccessModuleForUser, isModuleEnabled } from '@/lib/tenant-modules'
import { enqueuePersonalItem, listPersonalQueueForAgent, listPersonalQueueForUnit, type PersonalItemType } from '@/lib/seller-queue/personal-queue'

const VALID_TYPES: PersonalItemType[] = ['AGENDAMENTO', 'RETORNO', 'POS_VENDA', 'OUTRO']
const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const [canViewQueue, canViewPanel, canViewUnitPersonalQueues] = await Promise.all([
    canAccessModuleForUser(user, 'sellerQueue.view'),
    canAccessModuleForUser(user, 'queue.panel.view'),
    canAccessModuleForUser(user, 'queue.personal_queues.view_unit'),
  ])
  const panelFallback = isQueuePanelFallbackUser(user)
  if (!canViewQueue && !canViewPanel && !canViewUnitPersonalQueues && !panelFallback) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  if (canViewQueue) {
    const gate = await assertModuleEnabled(user, 'sellerQueue.view')
    if (gate) return gate
  } else if (user.role !== 'MASTER' && !await isModuleEnabled(tenantId, 'sellerQueue.view')) {
    return forbiddenResponse('Este recurso não está habilitado para a sua loja. Fale com o suporte.')
  }

  try {
    const unitScope = await resolveQueueUnitForRead(req, user, tenantId)
    if (!unitScope.unitId) {
      return NextResponse.json({ success: false, error: unitScope.error ?? 'Informe a unidade (?unitId=).' }, { status: unitScope.status ?? 400 })
    }
    const unitId = unitScope.unitId
    const url = new URL(req.url)
    const wantsAll = url.searchParams.get('all') === '1'
    // Gestão e usuário de painel veem a fila individual da unidade; vendedor vê a própria.
    if (wantsAll && (canAccessModule(user.role, 'sellerQueue.manage') || panelFallback || canViewPanel || canViewUnitPersonalQueues)) {
      const items = await listPersonalQueueForUnit(tenantId, unitId)
      return NextResponse.json({ success: true, data: items, scope: 'unit' })
    }
    const items = await listPersonalQueueForAgent(tenantId, unitId, user.id)
    return NextResponse.json({ success: true, data: items, scope: 'me' })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.customerArrived')) return forbiddenResponse('Sem permissão para enfileirar cliente.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.customerArrived'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })

  try {
    const b = await req.json().catch(() => ({}))
    const itemType = String(b?.itemType ?? '').toUpperCase() as PersonalItemType
    if (!VALID_TYPES.includes(itemType)) return NextResponse.json({ success: false, error: 'Tipo inválido (AGENDAMENTO/RETORNO/POS_VENDA/OUTRO).' }, { status: 400 })
    const agentUserId = String(b?.agentUserId ?? '')
    if (!agentUserId) return NextResponse.json({ success: false, error: 'Informe o responsável (agentUserId).' }, { status: 400 })

    // O responsável precisa ser da MESMA unidade/tenant. Vendedor só enfileira para
    // si; a gestão pode enfileirar para qualquer colaborador da unidade.
    const target = await prisma.user.findUnique({ where: { id: agentUserId }, select: { tenantId: true, unitId: true, status: true } })
    if (!target || target.tenantId !== tenantId || target.unitId !== unitId || target.status !== 'ATIVO') {
      return NextResponse.json({ success: false, error: 'Responsável inválido para esta unidade.' }, { status: 400 })
    }
    if (agentUserId !== user.id && !MANAGE_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Você só pode enfileirar para si mesmo.' }, { status: 403 })
    }

    const item = await enqueuePersonalItem({
      tenantId, unitId, agentUserId, itemType, createdByUserId: user.id,
      customerName: b?.customerName ?? null, customerPhone: b?.customerPhone ?? null,
      customerId: b?.customerId ?? null, dealId: b?.dealId ?? null, leadId: b?.leadId ?? null,
      priority: typeof b?.priority === 'number' ? b.priority : null, source: b?.source ?? 'manual', notes: b?.notes ?? null,
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'PERSONAL_QUEUE_ENQUEUE', entity: 'AgentPersonalQueueItem', entityId: item.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: item.id } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
