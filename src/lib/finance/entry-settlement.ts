// =============================================================================
// Baixa detalhada de lançamento (Financeiro › Lançamentos → painel do lançamento).
//   loadEntryDetail   → lançamento + itens + origem (negociação, débito, pagamento,
//                       veículo) + comissões de documento + cobrado × custo real.
//   saveEntryCosts    → grava itens/valor real/fornecedor/conta e, se pedido, dá baixa.
//   applyStatusSideEffects → baixa/estorno refletem na comissão e no pagamento da negociação.
// Regras puras em entry-settlement-core.ts.
// =============================================================================

import type { FinancialEntry, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { DEBT_SOURCE_PREFIX, PAYMENT_SOURCE_PREFIX, TRADE_SOURCE_PREFIX } from './deal-finance-sync'
import {
  COST_ITEM_LABEL, DOC_DEBT_TYPES, SERVICE_SUGGESTED_ITEMS, SUGGESTED_ITEMS, chargeResult, isChargedToCustomer, itemsTotal, normalizeItems,
  pickWarrantyCommissions, type CostItemInput, type CostItemKind,
} from './entry-settlement-core'
import {
  FI_ADDON_SOURCE_PREFIX, FI_PLUS_SOURCE_PREFIX, FI_RETURN_SOURCE_PREFIX, SERVICE_SOURCE_PREFIX, WARRANTY_SOURCE_PREFIX,
  serviceCostSpec, serviceRefOfSource,
} from './service-sync-core'
import { SERVICE_KIND_BY_KEY } from './result-centers-core'
import { PARTIAL_SOURCE_SEP, baseSource, partialBlockedReason, principalOf, titleSummary } from './settlement-core'

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d))
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

const DEBT_TYPE_LABEL: Record<string, string> = {
  MULTA: 'Multa', IPVA: 'IPVA', LICENCIAMENTO: 'Licenciamento', FINANCIAMENTO: 'Quitação de financiamento',
  DOCUMENTACAO: 'Documentação', DESPACHANTE: 'Despachante', CAUTELAR: 'Cautelar', REPARO: 'Reparo', OUTROS: 'Outros',
}
const RESP_LABEL: Record<string, string> = { COMPRADOR: 'Comprador', CLIENTE: 'Comprador', VENDEDOR: 'Vendedor', LOJA: 'Loja' }

export function sourceLabel(source: string | null) {
  if (!source || source === 'MANUAL' || source.startsWith('MANUAL_NEG_')) return 'Manual'
  if (source.startsWith(PAYMENT_SOURCE_PREFIX)) return 'Pagamento da negociação'
  if (source.startsWith(DEBT_SOURCE_PREFIX)) return 'Débito da negociação'
  if (source.startsWith(TRADE_SOURCE_PREFIX)) return 'Veículo na troca'
  if (source.startsWith(SERVICE_SOURCE_PREFIX)) return 'Serviço da negociação'
  if (source.startsWith(WARRANTY_SOURCE_PREFIX)) return 'Garantia da negociação'
  if (source.startsWith(FI_RETURN_SOURCE_PREFIX)) return 'Retorno do financiamento'
  if (source.startsWith(FI_PLUS_SOURCE_PREFIX)) return 'PLUS do financiamento'
  if (source.startsWith(FI_ADDON_SOURCE_PREFIX)) return 'Agregado do financiamento'
  if (source.startsWith('VEICULO_')) return 'Custo do veículo'
  return ({ VENDA: 'Venda', COMISSAO: 'Comissão', RETORNO: 'Comissão — retorno', GARANTIA: 'Comissão — garantia' } as Record<string, string>)[source] ?? source
}

/** Comissões de DOCUMENTO da negociação (ao vivo do sistema de comissões). */
async function docCommissions(tenantId: string | null, dealId: string) {
  const rows = await prisma.commissionCalculation.findMany({
    where:  { tenantId, ruleType: 'DOCUMENTO', ruleDetails: { path: ['dealId'], equals: dealId } as never },
    select: { id: true, description: true, commissionValue: true, status: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((c) => ({ id: c.id, description: c.description, amount: num(c.commissionValue), status: c.status as string }))
}

/** Comissões do SERVIÇO (ruleDetails.serviceId) ou da GARANTIA vendida (ruleType GARANTIA da negociação). */
async function serviceCommissions(tenantId: string | null, ref: { kind: 'SERVICE' | 'WARRANTY'; id: string }, dealId: string | null) {
  const select = { id: true, description: true, commissionValue: true, status: true, ruleDetails: true } as const
  const rows = ref.kind === 'SERVICE'
    ? await prisma.commissionCalculation.findMany({
        where:  { tenantId, ruleDetails: { path: ['serviceId'], equals: ref.id } as never },
        select, orderBy: { createdAt: 'asc' },
      })
    : dealId
      ? pickWarrantyCommissions(await prisma.commissionCalculation.findMany({
          where:  { tenantId, ruleType: 'GARANTIA', ruleDetails: { path: ['dealId'], equals: dealId } as never },
          select, orderBy: { createdAt: 'asc' },
        }), ref.id)
      : []
  return rows.map((c) => ({ id: c.id, description: c.description, amount: num(c.commissionValue), status: c.status as string }))
}

/** Pagamento de origem: NEG_PGTO_<id> (confirma na negociação) ou F&I (NEG_RETORNO_/NEG_PLUS_/NEG_AGREG_<id>_<i>). */
function paymentRefOfSource(raw: string | null): { id: string; linked: boolean } | null {
  const source = baseSource(raw)
  if (!source) return null
  if (source.startsWith(PAYMENT_SOURCE_PREFIX)) return { id: source.slice(PAYMENT_SOURCE_PREFIX.length), linked: true }
  for (const p of [FI_RETURN_SOURCE_PREFIX, FI_PLUS_SOURCE_PREFIX, FI_ADDON_SOURCE_PREFIX]) {
    if (source.startsWith(p)) return { id: source.slice(p.length).split('_')[0], linked: false }
  }
  return null
}

/**
 * Baixas do título (parciais + final) para o painel do lançamento. Aceita o
 * próprio título ou uma baixa parcial (filho) — devolve sempre o título.
 * Estorno é LIFO: só a última baixa pode ser estornada.
 */
async function loadSettlementInfo(e: FinancialEntry) {
  const title = e.parentEntryId
    ? await prisma.financialEntry.findUnique({ where: { id: e.parentEntryId } })
    : e
  if (!title) return null
  const [partials, accounts] = await Promise.all([
    prisma.financialEntry.findMany({ where: { parentEntryId: title.id }, orderBy: { createdAt: 'asc' } }),
    prisma.financialAccount.findMany({ where: { tenantId: title.tenantId }, select: { id: true, name: true } }),
  ])
  const accName = new Map(accounts.map((a) => [a.id, a.name]))
  const money = (x: FinancialEntry) => ({ amount: num(x.amount), interestAmount: x.interestAmount == null ? null : num(x.interestAmount), discountAmount: x.discountAmount == null ? null : num(x.discountAmount) })
  const settledTitle = title.status === 'PAGO' || title.status === 'RECEBIDO'
  const row = (x: FinancialEntry, kind: 'PARCIAL' | 'FINAL', n: number) => ({
    id: x.id, kind, n, paidDate: iso(x.paidDate), account: x.accountId ? accName.get(x.accountId) ?? null : null,
    paymentMethod: x.paymentMethod, principal: principalOf(money(x)), interest: num(x.interestAmount), discount: num(x.discountAmount),
    paid: num(x.amount), batchId: x.settlementBatchId, notes: x.notes, canReverse: false,
  })
  const baixas = partials.map((p, i) => {
    const n = Number(p.source?.split(PARTIAL_SOURCE_SEP)[1])
    return row(p, 'PARCIAL', Number.isFinite(n) && n > 0 ? n : i + 1)
  })
  if (settledTitle) baixas.push(row(title, 'FINAL', baixas.length + 1))
  const reversible = !title.transferGroupId && baixas.length > 0
  if (reversible) baixas[baixas.length - 1].canReverse = true
  return {
    titleId: title.id,
    title: { id: title.id, description: title.description, status: title.status },
    isChild: !!e.parentEntryId,
    transfer: !!title.transferGroupId,
    summary: titleSummary({ status: title.status, ...money(title) }, partials.map(money)),
    partialCount: partials.length,
    partialBlocked: partialBlockedReason(title),
    baixas,
  }
}

export async function loadEntryDetail(id: string) {
  const e = await prisma.financialEntry.findUnique({
    where:   { id },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }, account: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } },
  })
  if (!e) return null

  const src = baseSource(e.source)
  const debtId = src?.startsWith(DEBT_SOURCE_PREFIX) ? src.slice(DEBT_SOURCE_PREFIX.length) : null
  const payRef = paymentRefOfSource(e.source)
  const paymentId = payRef?.id ?? null
  const svcRef = serviceRefOfSource(e.source)
  const [settlement, deal, debt, payment, vehicle, supplier, service, warrantySale] = await Promise.all([
    loadSettlementInfo(e),
    e.dealId ? prisma.deal.findUnique({
      where:  { id: e.dealId },
      select: { id: true, dealNumber: true, status: true, type: true, customer: { select: { name: true } }, person: { select: { nomeCompleto: true } }, seller: { select: { fullName: true, shortName: true } }, vehicles: { select: { role: true, plate: true, model: true, vehicleId: true } } },
    }) : null,
    debtId ? prisma.dealDebt.findUnique({ where: { id: debtId } }) : null,
    paymentId ? prisma.dealPayment.findUnique({ where: { id: paymentId } }) : null,
    e.vehicleId ? prisma.vehicle.findUnique({ where: { id: e.vehicleId }, select: { id: true, plate: true, brand: true, model: true } }) : null,
    e.supplierId ? prisma.supplier.findUnique({ where: { id: e.supplierId }, select: { id: true, name: true } }) : null,
    svcRef?.kind === 'SERVICE' ? prisma.dealService.findUnique({ where: { id: svcRef.id } }) : null,
    svcRef?.kind === 'WARRANTY' ? prisma.warrantySale.findUnique({ where: { id: svcRef.id }, include: { warranty: { select: { name: true } } } }) : null,
  ])

  const isDoc = !!debt && DOC_DEBT_TYPES.includes(debt.type)
  const serviceKind = service ? serviceCostSpec(service).kind : warrantySale ? 'GARANTIA' : null
  const resultKind: 'DOCUMENTO' | 'SERVICO' | null = isDoc ? 'DOCUMENTO' : svcRef && (service || warrantySale) ? 'SERVICO' : null
  const commissions = isDoc && e.dealId
    ? await docCommissions(e.tenantId, e.dealId)
    : resultKind === 'SERVICO' && svcRef ? await serviceCommissions(e.tenantId, svcRef, e.dealId) : []
  const charged = debt ? (isChargedToCustomer(debt.responsavel) ? num(e.chargedAmount ?? debt.value) : 0)
    : service ? num(e.chargedAmount ?? service.value)
    : warrantySale ? num(e.chargedAmount ?? warrantySale.finalPrice)
    : num(e.chargedAmount)
  const hasItems = e.items.length > 0
  const settled = e.status === 'PAGO' || e.status === 'RECEBIDO'
  // Custo real conhecido = itens lançados ou baixa feita; antes disso o custo é a previsão.
  const cost = e.type === 'DESPESA' ? num(e.amount) : 0
  const result = e.type === 'DESPESA' && (debt || service || warrantySale || e.chargedAmount != null)
    ? { ...chargeResult({ charged, cost, commissions }), costIsEstimate: !hasItems && !settled }
    : null

  return {
    entry: {
      id: e.id, type: e.type, status: e.status, description: e.description, amount: num(e.amount),
      chargedAmount: e.chargedAmount == null ? null : num(e.chargedAmount),
      dueDate: iso(e.dueDate), paidDate: iso(e.paidDate), competenceDate: iso(e.competenceDate),
      accountId: e.accountId, account: e.account?.name ?? null, categoryId: e.categoryId, category: e.category?.name ?? null,
      counterparty: e.counterparty, supplierId: e.supplierId, supplier: supplier?.name ?? null,
      documentNumber: e.documentNumber, paymentMethod: e.paymentMethod, notes: e.notes,
      source: e.source, sourceLabel: sourceLabel(e.source), tenantId: e.tenantId,
      commissionLinked: !!e.commissionCalculationId, serviceLinked: !!e.vehicleServiceId,
    },
    items: e.items.map((i) => ({ id: i.id, kind: i.kind, label: (COST_ITEM_LABEL as Record<string, string>)[i.kind] ?? i.kind, description: i.description, amount: num(i.amount), supplierId: i.supplierId })),
    deal: deal ? {
      id: deal.id, dealNumber: deal.dealNumber, status: deal.status, type: deal.type, customer: deal.person?.nomeCompleto ?? deal.customer?.name ?? null,
      seller: deal.seller?.shortName ?? deal.seller?.fullName ?? null,
      vehicles: deal.vehicles.map((v) => ({ role: v.role, plate: v.plate, model: v.model, vehicleId: v.vehicleId })),
    } : null,
    debt: debt ? {
      id: debt.id, type: debt.type, typeLabel: DEBT_TYPE_LABEL[debt.type] ?? debt.type, value: num(debt.value),
      responsavel: debt.responsavel, responsavelLabel: RESP_LABEL[String(debt.responsavel ?? '').toUpperCase()] ?? debt.responsavel,
      vehicleRole: debt.vehicleRole, chargedToCustomer: isChargedToCustomer(debt.responsavel), isDocumentation: isDoc,
    } : null,
    payment: payment ? {
      id: payment.id, type: payment.type, method: payment.method, bank: payment.bank, installments: payment.installments,
      status: payment.status, authorizationCode: payment.authorizationCode,
      contractNumber: payment.contractNumber, confirmsDeal: !!payRef?.linked,
    } : null,
    service: service ? {
      id: service.id, name: service.name, value: num(service.value), kind: serviceKind,
      kindLabel: SERVICE_KIND_BY_KEY[serviceKind ?? '']?.label ?? null, supplier: service.supplier,
    } : warrantySale ? {
      id: warrantySale.id, name: warrantySale.warranty?.name ?? 'Garantia', value: num(warrantySale.finalPrice), kind: 'GARANTIA',
      kindLabel: SERVICE_KIND_BY_KEY.GARANTIA.label, supplier: null as string | null,
    } : null,
    resultKind,
    vehicle: vehicle ? { id: vehicle.id, plate: vehicle.plate, title: [vehicle.brand, vehicle.model].filter(Boolean).join(' ') } : null,
    commissions,
    result,
    settlement,
    suggestedKinds: (debt ?SUGGESTED_ITEMS[debt.type] : serviceKind ? SERVICE_SUGGESTED_ITEMS[serviceKind] : null) ?? (e.type === 'DESPESA' ? (['OUTRO'] as CostItemKind[]) : []),
  }
}

export type EntryDetail = NonNullable<Awaited<ReturnType<typeof loadEntryDetail>>>

/** Baixa/estorno refletem na comissão (sistema de comissões) e no pagamento da negociação. */
export async function applyStatusSideEffects(existing: Pick<FinancialEntry, 'status' | 'paidDate' | 'source' | 'commissionCalculationId'>, status: string, paidDate: Date | null) {
  if (status === existing.status) return
  if (existing.commissionCalculationId) {
    if (status === 'PAGO') {
      await prisma.commissionCalculation.updateMany({ where: { id: existing.commissionCalculationId, status: { notIn: ['CANCELADO', 'PAGO'] } }, data: { status: 'PAGO', paidAt: paidDate ?? existing.paidDate ?? new Date() } })
    } else if (existing.status === 'PAGO' && status === 'PREVISTO') {
      await prisma.commissionCalculation.updateMany({ where: { id: existing.commissionCalculationId, status: 'PAGO' }, data: { status: 'APROVADO', paidAt: null } })
    }
  }
  if (existing.source?.startsWith(PAYMENT_SOURCE_PREFIX)) {
    const data = status === 'RECEBIDO' || status === 'PAGO' ? { status: 'CONFIRMADO', paidAt: paidDate ?? new Date() }
      : status === 'CANCELADO' ? { status: 'CANCELADO' }
      : { status: 'PENDENTE', paidAt: null }
    await prisma.dealPayment.updateMany({ where: { id: existing.source.slice(PAYMENT_SOURCE_PREFIX.length) }, data })
      .catch((err) => console.error('[entry-settlement] pagamento da negociação', err))
  }
}

export interface SaveCostsInput {
  items?: CostItemInput[]
  amount?: number | null
  settle?: boolean
  paidDate?: string | null
  dueDate?: string | null
  accountId?: string | null
  paymentMethod?: string | null
  supplierId?: string | null
  counterparty?: string | null
  documentNumber?: string | null
  notes?: string | null
}

const day = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T12:00:00`) : null)

/** Grava a composição do custo real e, com `settle`, dá a baixa. Retorna erro legível ou null. */
export async function saveEntryCosts(id: string, input: SaveCostsInput): Promise<string | null> {
  const existing = await prisma.financialEntry.findUnique({ where: { id } })
  if (!existing) return 'Lançamento não encontrado.'
  if (existing.status === 'CANCELADO') return 'Lançamento cancelado: reabra antes de dar baixa.'
  if (existing.vehicleServiceId && (input.items?.length || input.amount != null)) return 'Custo de serviço: altere o valor na aba Serviços do veículo.'
  if (existing.commissionCalculationId && (input.items?.length || input.amount != null)) return 'Comissão: o valor vem do sistema de comissões.'
  if (existing.commissionCalculationId && input.settle) {
    const c = await prisma.commissionCalculation.findUnique({ where: { id: existing.commissionCalculationId }, select: { status: true } })
    if (c?.status === 'CANCELADO') return 'Comissão cancelada: não pode ser paga.'
  }

  let items = input.items ? normalizeItems(input.items) : null
  // Serviço/garantia da negociação: valor real digitado sem itens vira um item
  // (custo real detalhado) — a sincronização da negociação não o sobrescreve mais.
  if (serviceRefOfSource(existing.source) && (!items || items.length === 0) && input.amount != null) {
    const v = Math.round(Number(input.amount) * 100) / 100
    if (v > 0 && v !== num(existing.amount)) items = [{ kind: 'OUTRO', description: 'Custo real', amount: v, supplierId: input.supplierId || null }]
  }
  let newAmount: number | null = null
  if (items && items.length > 0) newAmount = itemsTotal(items)
  else if (input.amount != null) newAmount = Math.round(Number(input.amount) * 100) / 100
  if (newAmount != null && !(newAmount > 0)) return 'O valor real precisa ser maior que zero.'

  const data: Prisma.FinancialEntryUncheckedUpdateInput = {}
  if (newAmount != null && newAmount !== num(existing.amount)) {
    if (existing.chargedAmount == null) data.chargedAmount = existing.amount // guarda o cobrado/previsto original
    data.amount = newAmount
  }
  if (input.accountId !== undefined) data.accountId = input.accountId || null
  if (input.paymentMethod !== undefined) data.paymentMethod = input.paymentMethod || null
  if (input.documentNumber !== undefined) data.documentNumber = input.documentNumber || null
  if (input.notes !== undefined) data.notes = input.notes || null
  if (input.dueDate !== undefined) data.dueDate = day(input.dueDate)
  if (input.supplierId !== undefined) {
    data.supplierId = input.supplierId || null
    if (input.supplierId && !input.counterparty) {
      const s = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { name: true } })
      if (s) data.counterparty = s.name
    }
  }
  if (input.counterparty !== undefined && input.counterparty) data.counterparty = input.counterparty
  let paidDate: Date | null = null
  if (input.settle) {
    data.status = existing.type === 'DESPESA' ? 'PAGO' : 'RECEBIDO'
    paidDate = day(input.paidDate) ?? new Date()
    data.paidDate = paidDate
  }

  await prisma.$transaction(async (tx) => {
    if (items) {
      await tx.financialEntryItem.deleteMany({ where: { entryId: id } })
      if (items.length) {
        await tx.financialEntryItem.createMany({
          data: items.map((i, idx) => ({ entryId: id, tenantId: existing.tenantId, kind: i.kind, description: i.description, amount: i.amount, supplierId: i.supplierId ?? (input.supplierId || null), sortOrder: idx })),
        })
      }
    }
    if (Object.keys(data).length) await tx.financialEntry.update({ where: { id }, data })
  })
  if (data.status) await applyStatusSideEffects(existing, String(data.status), paidDate)
  return null
}
