// =============================================================================
// /api/negotiations/[id] — Detalhar e editar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canEditSensitiveFields, SENSITIVE_FIELDS, EDITABLE_STATUSES } from '@/lib/negotiation-permissions'
import { computeDealTotals, createDealAudit } from '@/lib/negotiation-service'
import { canEditDeal, isDealLocked } from '@/lib/negotiation-rbac'
import { buildNegotiationAccessWhere, getNegotiationActorIds } from '@/lib/negotiation-access'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { applyChildren, planChildren, planHasChanges } from '@/lib/negotiation/children-sync'
import { BLOB_PREFIX, pendingFolder } from '@/lib/negotiation/storage'
import { resolveDealManagerUserId } from '@/lib/negotiation/manager'

export const dynamic = 'force-dynamic'

const MONETARY_FIELDS = new Set([
  'saleAmount', 'purchaseAmount', 'tradeValue', 'signalAmount',
  'financedAmount', 'documentationFee', 'servicesAmount',
  'discountAmount', 'payoffAmount', 'vehicleValue', 'changeAmount',
])

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const params = await Promise.resolve(ctxArg.params)
  const dealId = params?.id
  if (!dealId) return NextResponse.json({ error: 'ID ausente na URL.' }, { status: 400 })

  const accessWhere = await buildNegotiationAccessWhere(session.user, { id: dealId })
  const deal = await prisma.deal.findFirst({
    where:   accessWhere,
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

  // Negociações antigas sem gerente: preenche com o gerente do vendedor/unidade (uma vez).
  if (!deal.managerId) {
    const managerUserId = await resolveDealManagerUserId(prisma, { sellerId: deal.sellerId, unitId: deal.unitId }).catch(() => null)
    if (managerUserId) {
      await prisma.deal.update({ where: { id: deal.id }, data: { managerId: managerUserId } }).catch(() => undefined)
      const u = await prisma.user.findUnique({ where: { id: managerUserId }, select: { id: true, name: true, email: true } })
      Object.assign(deal, { managerId: managerUserId, manager: u })
    }
  }

  // Edições antigas mudavam o valor de venda/compra sem atualizar o valor do
  // veículo: alinha uma vez (o resumo e a aba Veículos mostravam o preço velho).
  {
    const price = deal.type === 'COMPRA' ? deal.purchaseAmount : deal.type === 'CONSIGNACAO' ? null : deal.saleAmount
    const role = deal.type === 'COMPRA' ? 'COMPRADO' : 'VENDIDO'
    // Só com UM veículo nesse papel (venda de vários carros tem valor por veículo).
    const mains = deal.vehicles.filter((v) => v.role === role)
    const main = mains.length === 1 ? mains[0] : null
    const stale = price != null && mains.length <= 1 && (String(deal.vehicleValue ?? '') !== String(price) || (main && String(main.agreedValue ?? '') !== String(price)))
    if (stale) {
      await prisma.$transaction([
        prisma.deal.update({ where: { id: deal.id }, data: { vehicleValue: price } }),
        prisma.dealVehicle.updateMany({ where: { dealId: deal.id, role }, data: { agreedValue: price } }),
      ]).catch(() => undefined)
      Object.assign(deal, { vehicleValue: price })
      for (const v of deal.vehicles) if (v.role === role) Object.assign(v, { agreedValue: price })
    }
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

  return NextResponse.json({ data: dealWithHistory })
}

// ── PATCH — Editar negociação ─────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const params = await Promise.resolve(ctxArg.params)
  const dealId = params?.id
  if (!dealId) return NextResponse.json({ error: 'ID ausente na URL.' }, { status: 400 })

  const accessWhere = await buildNegotiationAccessWhere(session.user, { id: dealId })
  const deal = await prisma.deal.findFirst({ where: accessWhere })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (isDealLocked(deal.status)) {
    return NextResponse.json(
      { error: 'Negociação finalizada. Reabra para alterar.' },
      { status: 423 },
    )
  }

  const actorIds = await getNegotiationActorIds(session.user)
  const actor = {
    id:       session.user.id,
    role:     session.user.role,
    tenantId: session.user.tenantId ?? null,
    sellerId: actorIds.sellerId,
  }
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

  // Whitelist explícita de colunas escalares do Deal que aceitamos via PATCH.
  // Tudo que não estiver aqui é IGNORADO (especialmente nested objects como
  // `person`, `vehicle`, `debts`, `customer` que o wizard envia mas não são
  // colunas do Deal — Prisma os rejeitaria com PrismaClientValidationError).
  const DEAL_PATCHABLE_FIELDS = new Set<string>([
    // Identificação / relacionamentos
    'type', 'unitId', 'sellerId', 'managerId', 'personId',
    // Financeiro
    'saleAmount', 'purchaseAmount', 'financedAmount', 'documentationFee',
    'signalAmount', 'payoffAmount', 'discountAmount', 'servicesAmount',
    'vehicleValue', 'tradeValue', 'totalPayments', 'changeAmount',
    'marginAmount', 'balance',
    'paymentBank', 'paymentType',
    // Troco / dados bancários
    'changeBeneficiary', 'changeBeneficiaryCpf', 'changeBank',
    'changeAgency', 'changeAccount', 'changePix',
    // Consignação
    'consignMinValue', 'consignCommPct', 'consignDeadline',
    // Agendamento e observações
    'deliveryDate', 'notes', 'sellerNameFromSheet',
  ])

  // Campos numéricos: o wizard às vezes envia como string mascarada
  // (ex: "1.500,00"). Tratamos com parseBRL no caller, mas garantimos
  // aqui que strings vazias viram null e números/strings numéricas válidas
  // viram Number — evita "" em coluna Decimal.
  const NUMERIC_FIELDS = new Set<string>([
    'saleAmount', 'purchaseAmount', 'financedAmount', 'documentationFee',
    'signalAmount', 'payoffAmount', 'discountAmount', 'servicesAmount',
    'vehicleValue', 'tradeValue', 'totalPayments', 'changeAmount',
    'marginAmount', 'balance', 'consignMinValue', 'consignCommPct',
  ])

  function coerceValue(field: string, raw: unknown): unknown {
    if (raw === '' || raw === undefined) return null
    if (NUMERIC_FIELDS.has(field) && raw != null) {
      const n = typeof raw === 'number' ? raw : Number(raw)
      return Number.isFinite(n) ? n : null
    }
    if ((field === 'deliveryDate' || field === 'consignDeadline') && raw != null) {
      const d = raw instanceof Date ? raw : new Date(String(raw))
      return Number.isNaN(d.getTime()) ? null : d
    }
    return raw
  }

  const allowedFields: Record<string, unknown> = {}
  const auditEntries: Array<{ field: string; oldValue: unknown; newValue: unknown }> = []

  for (const [key, rawValue] of Object.entries(body)) {
    if (key === 'status') continue // status muda via endpoints específicos
    if (!DEAL_PATCHABLE_FIELDS.has(key)) continue // dropa nested objects + campos desconhecidos
    if (SENSITIVE_FIELDS.includes(key) && sensitiveBlocked) continue

    const value    = coerceValue(key, rawValue)
    const oldValue = (deal as any)[key]
    // Comparação tolerante: Decimal vira string via Prisma, então comparamos
    // sempre como string para evitar diffs falsos
    if (String(oldValue ?? '') !== String(value ?? '')) {
      allowedFields[key] = value
      auditEntries.push({ field: key, oldValue, newValue: value })
    }
  }

  // ── Person update: o wizard de edição envia `person` aninhado com todos
  // os campos do cliente (inclusive endereço). Persistimos via update do
  // Person vinculado, com merge tolerante — campos vazios NÃO sobrescrevem
  // dados existentes (evita o bug "endereço sumiu").
  const PERSON_PATCHABLE_FIELDS = [
    'type', 'cpf', 'cnpj', 'nomeCompleto', 'rg', 'dataNascimento', 'nomeMae',
    'razaoSocial', 'nomeFantasia', 'inscricaoEstadual',
    'socioAdmNome', 'socioAdmCpf', 'socioAdmPhone', 'socioAdmNomeMae',
    'socioAdmEmail', 'socioAdmWhatsapp',
    'email', 'phone', 'whatsapp',
    'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  ] as const

  const personBody = (body as Record<string, unknown>).person as Record<string, unknown> | undefined
  let personPatch: Record<string, unknown> | null = null
  if (personBody && typeof personBody === 'object' && deal.personId) {
    const patch: Record<string, unknown> = {}
    for (const field of PERSON_PATCHABLE_FIELDS) {
      if (!(field in personBody)) continue
      const v = personBody[field]
      // Boolean fica (true/false). String vazia, null e undefined → não toca
      // (preserva valor salvo). Datas viram Date.
      if (typeof v === 'boolean') {
        patch[field] = v
      } else if (v === '' || v == null) {
        continue
      } else if (field === 'dataNascimento') {
        const d = new Date(String(v))
        if (!Number.isNaN(d.getTime())) patch[field] = d
      } else {
        patch[field] = v
      }
    }
    if (Object.keys(patch).length > 0) personPatch = patch
  }

  // Valor do veículo acompanha o valor de venda/compra editado (o wizard só
  // envia saleAmount/purchaseAmount; vehicleValue e o valor do veículo
  // vinculado ficavam com o valor antigo e o resumo mostrava o preço velho).
  const priceField = deal.type === 'COMPRA' ? 'purchaseAmount' : deal.type === 'CONSIGNACAO' ? null : 'saleAmount'
  const newVehiclePrice = priceField && priceField in allowedFields && !('vehicleValue' in body) ? allowedFields[priceField] : undefined
  if (newVehiclePrice !== undefined && String(deal.vehicleValue ?? '') !== String(newVehiclePrice ?? '')) allowedFields.vehicleValue = newVehiclePrice
  if (!deal.managerId && !('managerId' in allowedFields)) {
    const m = await resolveDealManagerUserId(prisma, { sellerId: (allowedFields.sellerId as string | undefined) ?? deal.sellerId, unitId: (allowedFields.unitId as string | undefined) ?? deal.unitId }).catch(() => null)
    if (m) allowedFields.managerId = m
  }

  // Se o usuário não enviou nenhuma mudança válida, devolvemos sucesso vazio
  // em vez de chamar update com data:{} (que Prisma também rejeita).
  // Pagamentos e débitos da tela de edição: grava por id só o que mudou (com log).
  const childrenPlan = await planChildren(dealId, body)
  const childrenChanged = planHasChanges(childrenPlan)

  if (Object.keys(allowedFields).length === 0 && !personPatch && !childrenChanged) {
    return NextResponse.json({ data: deal, message: 'Nenhuma alteração detectada.' })
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
      // Atualiza Person primeiro (se houver patch). Falha aqui aborta tudo.
      if (personPatch && deal.personId) {
        await tx.person.update({
          where: { id: deal.personId },
          data:  personPatch as never,
        })
      }

      // Só chama deal.update se houver campos do Deal a atualizar.
      // Se só o Person mudou, retornamos o deal carregado novamente.
      const d = Object.keys(allowedFields).length > 0
        ? await tx.deal.update({
            where: { id: dealId },
            data:  allowedFields as any,
          })
        : await tx.deal.findUniqueOrThrow({ where: { id: dealId } })

      // Veículo principal da negociação com o valor acordado novo.
      if (newVehiclePrice !== undefined && newVehiclePrice != null) {
        const role = deal.type === 'COMPRA' ? 'COMPRADO' : 'VENDIDO'
        // Só com UM veículo nesse papel (venda de vários carros tem valor por veículo).
        if ((await tx.dealVehicle.count({ where: { dealId, role } })) === 1) await tx.dealVehicle.updateMany({ where: { dealId, role }, data: { agreedValue: newVehiclePrice as never } })
      }

      // Auditoria campo a campo — paralela para não bloquear a transação
      await Promise.all(auditEntries.map(entry =>
        createDealAudit(tx as any, {
          dealId:   dealId,
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
          entityId: dealId,
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
            entityId:   dealId,
            userName:   session.user.name,
            userRole:   session.user.role,
            status:     'SUCCESS',
            beforeData: before as never,
            afterData:  after  as never,
          },
        })
      }

      if (childrenChanged) {
        // Comprovante/boleto enviado na edição vira anexo do pagamento/débito novo.
        const rawPay = new Map(((body.payments as Array<Record<string, unknown>>) ?? []).map((x) => [String(x.id ?? ''), x]))
        const rawDebt = new Map(((body.debts as Array<Record<string, unknown>>) ?? []).map((x) => [String(x.id ?? ''), x]))
        const pendingOk = (k: unknown) => typeof k === 'string' && (k.startsWith(`${BLOB_PREFIX}${pendingFolder(session.user.tenantId ?? '')}`) || k.startsWith(`deals/pending/${session.user.tenantId}/`))
        await applyChildren(tx, deal, childrenPlan, { id: session.user.id, name: session.user.name ?? null, role: session.user.role }, async (kind, tmpId, newId) => {
          const raw = (kind === 'payment' ? rawPay : rawDebt).get(tmpId)
          const r = raw?.receipt as { storageKey?: string; publicUrl?: string; fileName?: string; fileType?: string; mimeType?: string; fileSize?: number } | null | undefined
          if (!r || !pendingOk(r.storageKey)) return
          await tx.dealAttachment.create({
            data: {
              dealId, tenantId: deal.tenantId,
              category: kind === 'payment' ? 'COMPROVANTE_PAGAMENTO' : String(raw?.type ?? '').toUpperCase() === 'FINANCIAMENTO' ? 'COMPROVANTE_QUITACAO' : 'COMPROVANTE_DEBITO',
              fileName: String(r.fileName ?? 'comprovante').slice(0, 160), fileType: r.fileType ?? 'other', mimeType: r.mimeType ?? 'application/octet-stream',
              fileSize: Number(r.fileSize) || null, storageKey: r.storageKey!, publicUrl: r.publicUrl ?? null,
              ...(kind === 'payment' ? { paymentId: newId } : { debtId: newId }),
              uploadedById: session.user.id, uploadedByName: session.user.name ?? null,
            } as never,
          })
        })
      }

      return d
    })

    await syncDealFinanceSafe(params.id)
    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
