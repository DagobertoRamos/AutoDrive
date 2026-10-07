// =============================================================================
// Resultado da negociação (carga) — usa a regra pura de deal-result-core.
//   • Custo do veículo: lançamentos do carro nos grupos de CMV (aquisição,
//     preparação, documentação); sem lançamento de compra → valor da troca ou
//     preço de compra do cadastro.
//   • Serviços/documentação/garantia: cobrado × custo real (mesma regra do
//     relatório "Serviços vendidos").
//   • F&I: receitas de F&I lançadas na negociação (ou o retorno líquido).
//   • Comissões: todas as não canceladas da negociação.
// Carro com várias negociações de venda no período: o custo vai inteiro em cada
// uma (o relatório mostra a negociação; o carro é o centro de resultado).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { commissionEligibleDealWindowWhere } from '@/lib/commission/status'
import { costOf, loadDealCommissions, type CostEntry } from './deal-costs'
import { dealResult, groupServices, type DealResult, type DealResultService } from './deal-result-core'
import { SALE_DEAL_TYPES, loadFinanceRefs, monthBounds, type FinanceRefs } from './dre'
import { SERVICE_KIND_BY_KEY, isChargedDocDebt, serviceKindOf } from './result-centers-core'

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export interface DealResultRow extends DealResult {
  dealId: string
  dealNumber: string | null
  status: string
  date: Date
  customer: string | null
  vehicle: string | null
  plate: string | null
  sellerId: string | null
  sellerName: string | null
  unitId: string | null
  acquisitionSource: 'LANCAMENTOS' | 'TROCA' | 'CADASTRO' | null
}

export async function loadDealResults(tenantId: string, where: Record<string, unknown>, refs?: FinanceRefs): Promise<DealResultRow[]> {
  const deals = await prisma.deal.findMany({
    where: { tenantId, type: { in: [...SALE_DEAL_TYPES] }, ...where } as never,
    select: {
      id: true, dealNumber: true, status: true, sellerId: true, unitId: true, saleAmount: true, vehicleValue: true, discountAmount: true,
      returnNetValue: true, documentationFee: true, warrantyPaidBy: true,
      approvedAt: true, releasedAt: true, finalizedAt: true, saleDate: true, createdAt: true,
      customer: { select: { name: true } }, person: { select: { nomeCompleto: true } },
      seller: { select: { fullName: true, shortName: true } },
      vehicles: { where: { role: 'VENDIDO' }, select: { vehicleId: true, agreedValue: true, plate: true, brand: true, model: true, year: true } },
      services: { select: { id: true, name: true, value: true, cost: true, kind: true } },
      debts: { select: { id: true, type: true, value: true, responsavel: true } },
      warrantySales: { select: { id: true, finalPrice: true, costValue: true, status: true } },
      discountRequests: { where: { status: 'APROVADO' }, select: { approvedValue: true, requestedValue: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })
  if (!deals.length) return []
  refs ??= await loadFinanceRefs(tenantId)
  const dealIds = deals.map((d) => d.id)
  const vehicleIds = [...new Set(deals.flatMap((d) => d.vehicles.map((v) => v.vehicleId)).filter((x): x is string => !!x))]

  const [vehicles, entries, commissions, trades] = await Promise.all([
    vehicleIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, purchasePrice: true } }) : [],
    prisma.financialEntry.findMany({
      where: { tenantId, status: { not: 'CANCELADO' }, transferGroupId: null, OR: [...(vehicleIds.length ? [{ vehicleId: { in: vehicleIds } }] : []), { dealId: { in: dealIds } }] },
      select: { type: true, amount: true, source: true, categoryId: true, vehicleId: true, dealId: true, status: true, supplierId: true, counterparty: true, items: { select: { description: true, amount: true } } },
    }),
    loadDealCommissions(tenantId, dealIds),
    vehicleIds.length
      ? prisma.dealVehicle.findMany({ where: { vehicleId: { in: vehicleIds }, role: 'TROCA', deal: { tenantId, status: { notIn: ['CANCELADA', 'DESAPROVADA', 'RECUSADA', 'RASCUNHO'] } } }, select: { vehicleId: true, agreedValue: true, evaluatedValue: true } })
      : [],
  ])

  const purchase = new Map(vehicles.map((v) => [v.id, Number(v.purchasePrice ?? 0)]))
  const tradeValue = new Map<string, number>()
  for (const t of trades) if (t.vehicleId) tradeValue.set(t.vehicleId, Number(t.agreedValue ?? t.evaluatedValue ?? 0))
  const vehCost = new Map<string, { acq: number; prep: number; doc: number; hasAcq: boolean }>()
  const fiByDeal = new Map<string, number>()
  const bySource = new Map<string, CostEntry[]>()
  for (const e of entries) {
    const amount = Number(e.amount)
    const type = e.type as 'RECEITA' | 'DESPESA'
    const src = e.source ?? ''
    if (e.dealId && type === 'DESPESA' && (src.startsWith('NEG_SERV_') || src.startsWith('NEG_GAR_') || src.startsWith('NEG_DEBITO_'))) {
      bySource.set(src, [...(bySource.get(src) ?? []), { amount, status: e.status, supplier: e.counterparty ?? null, items: e.items.map((i) => ({ description: i.description, amount: Number(i.amount) })) }])
      continue
    }
    const group = refs.groupOf({ type, source: e.source, categoryId: e.categoryId })
    if (e.vehicleId && (group === 'CMV_AQUISICAO' || group === 'CMV_PREPARACAO' || group === 'CMV_DOCUMENTACAO')) {
      const signed = type === 'DESPESA' ? amount : -amount
      const c = vehCost.get(e.vehicleId) ?? { acq: 0, prep: 0, doc: 0, hasAcq: false }
      if (group === 'CMV_AQUISICAO') { c.acq += signed; c.hasAcq = true } else if (group === 'CMV_PREPARACAO') c.prep += signed; else c.doc += signed
      vehCost.set(e.vehicleId, c)
    } else if (group === 'REC_FI' && e.dealId) {
      fiByDeal.set(e.dealId, (fiByDeal.get(e.dealId) ?? 0) + (type === 'RECEITA' ? amount : -amount))
    }
  }
  const comByDeal = new Map<string, number>()
  for (const c of commissions) if (c.dealId) comByDeal.set(c.dealId, (comByDeal.get(c.dealId) ?? 0) + c.value)

  return deals.map((d) => {
    const single = d.vehicles.length === 1
    const vehicleSale = d.vehicles.length
      ? d.vehicles.reduce((s, v) => s + Number(v.agreedValue ?? (single ? d.vehicleValue ?? d.saleAmount : 0) ?? 0), 0)
      : Number(d.vehicleValue ?? d.saleAmount ?? 0)
    const discount = Number(d.discountAmount ?? 0) + d.discountRequests.reduce((s, r) => s + Number(r.approvedValue ?? r.requestedValue ?? 0), 0)

    let acquisition = 0, preparation = 0, documentation = 0
    let acquisitionSource: DealResultRow['acquisitionSource'] = null
    for (const v of d.vehicles) {
      if (!v.vehicleId) continue
      const c = vehCost.get(v.vehicleId)
      preparation += c?.prep ?? 0
      documentation += c?.doc ?? 0
      if (c?.hasAcq) { acquisition += c.acq; acquisitionSource = 'LANCAMENTOS' }
      else if (tradeValue.get(v.vehicleId)) { acquisition += tradeValue.get(v.vehicleId)!; acquisitionSource ??= 'TROCA' }
      else if ((purchase.get(v.vehicleId) ?? 0) > 0) { acquisition += purchase.get(v.vehicleId)!; acquisitionSource ??= 'CADASTRO' }
    }

    const services: DealResultService[] = []
    const docDebts = d.debts.filter(isChargedDocDebt)
    const docCharged = Number(d.documentationFee ?? 0) + docDebts.reduce((s, x) => s + Number(x.value), 0)
    const docCost = costOf(docDebts.flatMap((x) => bySource.get(`NEG_DEBITO_${x.id}`) ?? []), 0).cost
    if (docCharged || docCost) services.push({ kind: 'DOCUMENTACAO', label: 'Documentação', charged: docCharged, cost: docCost })
    for (const s of d.services) {
      const kind = serviceKindOf(s)
      services.push({ kind, label: SERVICE_KIND_BY_KEY[kind]?.label ?? s.name, charged: Number(s.value ?? 0), cost: costOf(bySource.get(`NEG_SERV_${s.id}`) ?? [], Number(s.cost ?? 0)).cost })
    }
    for (const w of d.warrantySales) {
      if (w.status !== 'ATIVA') continue
      services.push({ kind: 'GARANTIA', label: 'Garantia', charged: d.warrantyPaidBy === 'LOJA' ? 0 : Number(w.finalPrice ?? 0), cost: costOf(bySource.get(`NEG_GAR_${w.id}`) ?? [], Number(w.costValue ?? 0)).cost })
    }
    // Débitos que a loja assumiu (fora os de documentação cobrados do cliente).
    const storeDebts = d.debts
      .filter((x) => String(x.responsavel ?? '').toUpperCase() === 'LOJA')
      .reduce((s, x) => { const ents = bySource.get(`NEG_DEBITO_${x.id}`); return s + (ents?.length ? ents.reduce((a, e) => a + e.amount, 0) : Number(x.value)) }, 0)

    const fi = fiByDeal.has(d.id) ? fiByDeal.get(d.id)! : Number(d.returnNetValue ?? 0)
    const res = dealResult({
      vehicleSale: r2(vehicleSale), discount: r2(discount),
      vehicleCost: { acquisition: r2(acquisition), preparation: r2(preparation), documentation: r2(documentation) },
      fi: r2(fi), services: groupServices(services), storeDebts: r2(storeDebts), commissions: r2(comByDeal.get(d.id) ?? 0),
    })
    const v = d.vehicles[0]
    return {
      ...res, dealId: d.id, dealNumber: d.dealNumber, status: d.status,
      date: d.approvedAt ?? d.releasedAt ?? d.finalizedAt ?? d.saleDate ?? d.createdAt,
      customer: d.person?.nomeCompleto ?? d.customer?.name ?? null,
      vehicle: v ? [v.brand, v.model, v.year].filter(Boolean).join(' ') || null : null, plate: v?.plate ?? null,
      sellerId: d.sellerId, sellerName: d.seller ? d.seller.shortName || d.seller.fullName : null, unitId: d.unitId,
      acquisitionSource,
    }
  })
}

/** Resultado de UMA negociação (card da negociação). */
export async function loadDealResult(tenantId: string, dealId: string): Promise<DealResultRow | null> {
  return (await loadDealResults(tenantId, { id: dealId }))[0] ?? null
}

/** Relatório "Resultado por negociação" (mesma janela das comissões). */
export async function dealResultsReport(p: { tenantId: string; periods: string[]; unitId?: string | null; sellerId?: string | null }, refs: FinanceRefs) {
  const { start, end } = monthBounds(p.periods[0], p.periods[p.periods.length - 1])
  const rows = (await loadDealResults(p.tenantId, {
    ...(p.unitId ? { unitId: p.unitId } : {}), ...(p.sellerId ? { sellerId: p.sellerId } : {}),
    ...commissionEligibleDealWindowWhere({ start, end }),
  }, refs)).sort((a, b) => +b.date - +a.date)
  const sum = (f: (r: DealResultRow) => number) => r2(rows.reduce((s, r) => s + f(r), 0))
  const revenue = sum((r) => r.revenue.total), profit = sum((r) => r.profit)
  return {
    rows: rows.map(({ lines: _l, ...r }) => r),
    totals: {
      count: rows.length, revenue, profit, margin: revenue > 0 ? r2((profit / revenue) * 100) : null,
      vehicle: sum((r) => r.vehicleMargin), fi: sum((r) => r.revenue.fi), services: sum((r) => r.revenue.services - r.cost.services),
      commissions: sum((r) => r.cost.commissions), avgProfit: rows.length ? r2(profit / rows.length) : 0,
    },
  }
}
