// =============================================================================
// /api/negotiations/[id] — Detalhar e editar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canEditSensitiveFields, SENSITIVE_FIELDS, EDITABLE_STATUSES } from '@/lib/negotiation-permissions'
import { computeDealTotals, createDealAudit, createStatusHistory } from '@/lib/negotiation-service'
import { canEditDeal, isDealLocked } from '@/lib/negotiation-rbac'

export const dynamic = 'force-dynamic'

const MONETARY_FIELDS = new Set([
  'saleAmount', 'purchaseAmount', 'tradeValue', 'signalAmount',
  'financedAmount', 'documentationFee', 'servicesAmount',
  'discountAmount', 'payoffAmount', 'vehicleValue', 'changeAmount',
])

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({
    where:   { id: params.id },
    include: {
      person:   true,
      customer: true,
      seller:   {
        select: {
          id:       true,
          fullName: true,
          shortName: true,
          user:     { select: { id: true, name: true, email: true } },
        },
      },
      manager:  { select: { id: true, name: true, email: true } },
      vehicles: { include: { vehicle: true }, orderBy: { createdAt: 'asc' } },
      debts:    { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'asc' } },
      services: { orderBy: { createdAt: 'asc' } },
      history:  { orderBy: { createdAt: 'asc' } },
      discountRequests: { orderBy: { createdAt: 'desc' } },
      changes:  { orderBy: { createdAt: 'asc' } },
      reopenLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      pendencies: {
        where:  { status: { notIn: ['FINALIZADA', 'CANCELADA'] } },
        select: { id: true, type: true, status: true, priority: true, description: true },
        take:   10,
      },
      contracts: {
        select: { id: true, type: true, createdAt: true },
        take:   5,
      },
      sheetImportRows: {
        select: {
          id:             true,
          sheetName:      true,
          externalId:     true,
          rawData:        true,
          referenceMonth: true,
          sellerName:     true,
          customerName:   true,
          plate:          true,
          vehicleModel:   true,
          status:         true,
          createdAt:      true,
        },
        take:    5,
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!deal) {
    return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  }

  // Enriquecer histórico com nome do usuário (query separada)
  const userIds = deal.history
    .map((h) => h.changedByUserId)
    .filter((id): id is string => !!id)
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  // Lookup approvedBy and cancelledBy users
  const extraUserIds = [deal.approvedById, deal.cancelledById].filter((id): id is string => !!id)
  const extraUsers = extraUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: extraUserIds } },
        select: { id: true, name: true },
      })
    : []
  const extraUserMap = Object.fromEntries(extraUsers.map((u) => [u.id, u]))

  const dealWithHistory = {
    ...deal,
    approvedBy:  deal.approvedById  ? (extraUserMap[deal.approvedById]  ?? null) : null,
    cancelledBy: deal.cancelledById ? (extraUserMap[deal.cancelledById] ?? null) : null,
    statusHistory: deal.history.map((h) => ({
      ...h,
      changedByUser: h.changedByUserId ? { name: userMap[h.changedByUserId] ?? null } : null,
    })),
  }

  // Isolamento por tenant
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  return NextResponse.json({ data: dealWithHistory })
}

// ── PATCH — Editar negociação ─────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  if (isDealLocked(deal.status)) {
    return NextResponse.json(
      { error: 'Negociação finalizada. Reabra para alterar.' },
      { status: 423 },
    )
  }

  const actor = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId ?? null, sellerId: null }
  if (!canEditDeal(actor, deal)) {
    return NextResponse.json({ error: 'Sem permissão para editar esta negociação no status atual' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const editableSensitive = canEditSensitiveFields(session.user.role)
  const sensitiveBlocked  = !editableSensitive && !EDITABLE_STATUSES.includes(deal.status)

  const allowedFields: Record<string, unknown> = {}
  const auditEntries: Array<{ field: string; oldValue: unknown; newValue: unknown }> = []

  for (const [key, value] of Object.entries(body)) {
    if (key === 'status') continue // status muda via endpoints específicos
    if (SENSITIVE_FIELDS.includes(key) && sensitiveBlocked) continue

    const oldValue = (deal as any)[key]
    if (oldValue !== value) {
      allowedFields[key] = value
      auditEntries.push({ field: key, oldValue, newValue: value })
    }
  }

  // Recalcular totais se algum campo financeiro mudou
  const financialFields = ['saleAmount', 'purchaseAmount', 'tradeValue', 'signalAmount', 'financedAmount', 'documentationFee', 'servicesAmount', 'discountAmount', 'payoffAmount']
  const needsRecalc = financialFields.some((f) => f in allowedFields)

  if (needsRecalc) {
    const merged = {
      saleAmount:      allowedFields.saleAmount      ?? deal.saleAmount,
      purchaseAmount:  allowedFields.purchaseAmount  ?? deal.purchaseAmount,
      tradeValue:      allowedFields.tradeValue      ?? deal.tradeValue,
      signalAmount:    allowedFields.signalAmount    ?? deal.signalAmount,
      financedAmount:  allowedFields.financedAmount  ?? deal.financedAmount,
      documentationFee: allowedFields.documentationFee ?? deal.documentationFee,
      servicesAmount:  allowedFields.servicesAmount  ?? deal.servicesAmount,
      discountAmount:  allowedFields.discountAmount  ?? deal.discountAmount,
      payoffAmount:    allowedFields.payoffAmount    ?? deal.payoffAmount,
      changeAmount:    allowedFields.changeAmount    ?? deal.changeAmount,
    }
    const totals = computeDealTotals(merged as any)
    allowedFields.totalPayments = totals.totalPayments
    allowedFields.balance       = totals.balance
    allowedFields.marginAmount  = totals.marginAmount
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data:  allowedFields as any,
      })

      // Auditoria campo a campo — paralela para não bloquear a transação
      await Promise.all(auditEntries.map(entry =>
        createDealAudit(tx as any, {
          dealId:   params.id,
          tenantId: deal.tenantId,
          unitId:   deal.unitId,
          userId:   session.user.id,
          userName: session.user.name,
          userRole: session.user.role,
          action:   'EDITAR',
          field:    entry.field,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
        }),
      ))

      await tx.auditLog.create({
        data: {
          userId:   session.user.id,
          tenantId: session.user.tenantId ?? null,
          action:   'UPDATE',
          entity:   'Deal',
          entityId: params.id,
          userName: session.user.name,
          userRole: session.user.role,
          status:   'SUCCESS',
          afterData: allowedFields as never,
        },
      })

      // Auditoria específica de campos monetários (diff before/after)
      const monetaryDiff = auditEntries.filter(e => MONETARY_FIELDS.has(e.field))
      if (monetaryDiff.length > 0) {
        const before: Record<string, unknown> = {}
        const after:  Record<string, unknown> = {}
        for (const e of monetaryDiff) {
          before[e.field] = e.oldValue
          after[e.field]  = e.newValue
        }
        await tx.auditLog.create({
          data: {
            userId:     session.user.id,
            tenantId:   session.user.tenantId ?? null,
            action:     'UPDATE_MONETARY',
            entity:     'Deal',
            entityId:   params.id,
            userName:   session.user.name,
            userRole:   session.user.role,
            status:     'SUCCESS',
            beforeData: before as never,
            afterData:  after  as never,
          },
        })
      }

      return d
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
