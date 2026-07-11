// =============================================================================
// POST /api/seller-queue/compliance/penalties/[id]/appeal
// Vendedor solicita revisão de uma penalidade atribuída a ele.
// Body: { reason }. Cria pendência para a gestão e notifica.
// Gate: qualquer usuário autenticado (só pode recorrer das próprias penalidades).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const penalty = await prisma.sellerQueuePenalty.findFirst({ where: { id, tenantId } })
    if (!penalty) return NextResponse.json({ success: false, error: 'Penalidade não encontrada.' }, { status: 404 })
    // Vendedor só pode recorrer das próprias penalidades (ou gestão de qualquer uma).
    const isManager = ['MASTER','ADM','GERENTE_GERAL','GERENTE_ADMINISTRATIVO','GERENTE','VENDEDOR_LIDER','USUARIO_LIDER'].includes(user.role)
    if (!isManager && penalty.sellerId !== user.id) return forbiddenResponse('Você só pode recorrer das suas próprias penalidades.')

    const b = await req.json().catch(() => ({}))
    const reason = String(b?.reason ?? '').trim()
    if (!reason || reason.length < 10) return NextResponse.json({ success: false, error: 'Descreva o motivo do recurso (mín. 10 caracteres).' }, { status: 400 })

    // Checa se já há recurso pendente para esta penalidade.
    const existing = await prisma.pendency.findFirst({ where: { tenantId, originModule: 'SELLER_QUEUE_APPEAL', originRecordId: id, status: { in: ['ABERTA','EM_ANDAMENTO','AGUARDANDO_RESPOSTA','PAUSADA','REATIVADA'] } }, select: { id: true } })
    if (existing) return NextResponse.json({ success: false, error: 'Já existe um recurso em aberto para esta penalidade.' }, { status: 409 })

    // Resolve responsável (gerente/responsável da unidade).
    const responsibleSeller = await prisma.seller.findFirst({
      where: { unitId: penalty.unitId, active: true, user: { role: { in: ['GERENTE','GERENTE_GERAL','GERENTE_ADMINISTRATIVO','ADM','MASTER'] } } },
      orderBy: { createdAt: 'asc' }, select: { id: true },
    }).catch(() => null)
    const fallbackSeller = responsibleSeller ?? await prisma.seller.findFirst({ where: { unitId: penalty.unitId, active: true }, select: { id: true } }).catch(() => null)
    if (!fallbackSeller) return NextResponse.json({ success: false, error: 'Não foi possível identificar um responsável para o recurso. Contate a gestão diretamente.' }, { status: 400 })

    const appellant = await prisma.user.findUnique({ where: { id: penalty.sellerId }, select: { name: true } }).catch(() => null)
    const appellantName = appellant?.name ?? user.name

    const pendency = await prisma.pendency.create({ data: {
      tenantId, unitId: penalty.unitId, responsibleId: fallbackSeller.id,
      customerName: appellantName ?? 'Vendedor',
      description: `Recurso de penalidade (${penalty.type}, ${penalty.points} pts): ${reason}`,
      type: 'CONFORMIDADE_FILA', priority: 'ALTA' as never, status: 'ABERTA',
      originModule: 'SELLER_QUEUE_APPEAL', originRecordId: id, source: 'MANUAL',
      allowedDays: [], automaticSend: false,
      notes: `Penalidade ID: ${id}. Motivo da penalidade: ${penalty.reason ?? '—'}. Recurso do vendedor: ${reason}`,
      dueDate: new Date(Date.now() + 48 * 3600000),
    }})

    // Notifica o vendedor do recebimento.
    await prisma.notification.create({ data: { userId: user.id, tenantId, type: 'SISTEMA' as never, title: '📋 Recurso recebido', message: `Seu recurso foi registrado e será analisado pela gestão. Protocolo: ${pendency.id.slice(-8).toUpperCase()}`, actionUrl: '/vendedor-da-vez/conformidade' } }).catch(() => {})
    // Notifica gestores da unidade.
    await prisma.notification.createMany({ data: (await prisma.user.findMany({ where: { tenantId, unitId: penalty.unitId, role: { in: ['GERENTE','GERENTE_GERAL','GERENTE_ADMINISTRATIVO','ADM','MASTER'] } }, select: { id: true } }).catch(() => [])).map(m => ({ userId: m.id, tenantId, type: 'PENDENCIA_NOVA' as never, title: '⚖️ Recurso de penalidade recebido', message: `${appellantName} contestou uma penalidade (${penalty.points} pts). Analisar: ${reason.slice(0,80)}`, actionUrl: '/pendencias/central' })) }).catch(() => {})

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'COMPLIANCE_APPEAL', entity: 'SellerQueuePenalty', entityId: id, userName: user.name, userRole: user.role, afterData: { reason, pendencyId: pendency.id } })
    return NextResponse.json({ success: true, data: { pendencyId: pendency.id, protocol: pendency.id.slice(-8).toUpperCase() } })
  } catch (err) { return handlePrismaError(err) }
}
