// =============================================================================
// /api/negotiations/[id] — Detalhar e editar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canEditSensitiveFields, SENSITIVE_FIELDS, EDITABLE_STATUSES } from '@/lib/negotiation-permissions'
import { computeDealTotals, createDealAudit } from '@/lib/negotiation-service'
import { canEditDeal, isDealLocked } from '@/lib/negotiation-rbac'

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

  const params = await Promise.resolve(ctxArg.params)
  const dealId = params?.id
  if (!dealId) return NextResponse.json({ error: 'ID ausente na URL.' }, { status: 400 })

  const deal = await prisma.deal.findUnique({
    where:   { id: dealId },
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
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const params = await Promise.resolve(ctxArg.params)
  const dealId = params?.id
  if (!dealId) return NextResponse.json({ error: 'ID ausente na URL.' }, { status: 400 })

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
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

  // Se o usuário não enviou nenhuma mudança válida, devolvemos sucesso vazio
  // em vez de chamar update com data:{} (que Prisma também rejeita).
  if (Object.keys(allowedFields).length === 0 && !personPatch) {
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

      return d
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
