// =============================================================================
// Parceiros e consignados — conta-corrente de quem é dono do carro que a loja vende.
//   Parceiro = loja parceira (Vehicle.partnerStoreId → Supplier) ou o proprietário
//   particular (dono na negociação de consignação).
//   Por carro: em estoque (valor a repassar se vender), vendido aguardando
//   repasse, repassado (pago). Repasse = lançamento VEICULO_REPASSE; sem ele,
//   preço de compra do cadastro ou valor mínimo da consignação.
//   Saldo a pagar = repasses de carros vendidos ainda não pagos.
// =============================================================================

import { prisma } from '@/lib/prisma'

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
const SOLD = ['VENDIDO']
const REPASSE = 'VEICULO_REPASSE'

export interface PartnerVehicle {
  vehicleId: string; plate: string | null; description: string; stockStatus: string
  value: number; situation: 'ESTOQUE' | 'A_REPASSAR' | 'REPASSADO'; paidDate: Date | null; soldAt: Date | null
}
export interface PartnerRow {
  key: string; name: string; kind: 'LOJA_PARCEIRA' | 'PARTICULAR'
  inStock: { count: number; value: number }; toPay: { count: number; value: number }; paid: { count: number; value: number }
  vehicles: PartnerVehicle[]
}

export async function partnersReport(p: { tenantId: string; unitId?: string | null }) {
  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId: p.tenantId, ...(p.unitId ? { unitId: p.unitId } : {}), OR: [{ stockType: 'CONSIGNADO' }, { partnerStoreId: { not: null } }], NOT: { stockStatus: { in: ['DEVOLVIDO', 'CANCELADO'] as never[] } } },
    select: { id: true, plate: true, brand: true, model: true, modelYear: true, stockStatus: true, purchasePrice: true, partnerStoreId: true, partnerStore: { select: { id: true, name: true } }, exitDate: true },
    take: 3000,
  })
  if (!vehicles.length) return { rows: [] as PartnerRow[], totals: { partners: 0, inStock: 0, toPay: 0, paid: 0 } }
  const ids = vehicles.map((v) => v.id)
  const [entries, consigns] = await Promise.all([
    prisma.financialEntry.findMany({ where: { tenantId: p.tenantId, vehicleId: { in: ids }, source: { startsWith: REPASSE }, status: { not: 'CANCELADO' } }, select: { vehicleId: true, amount: true, status: true, paidDate: true, parentEntryId: true } }),
    prisma.dealVehicle.findMany({
      where: { vehicleId: { in: ids }, role: 'CONSIGNADO', deal: { status: { notIn: ['CANCELADA', 'RECUSADA', 'DESAPROVADA'] as never[] } } },
      select: { vehicleId: true, deal: { select: { consignMinValue: true, person: { select: { id: true, nomeCompleto: true } }, customer: { select: { id: true, name: true } } } } },
    }),
  ])
  const owner = new Map<string, { key: string; name: string; min: number | null }>()
  for (const c of consigns) {
    if (!c.vehicleId) continue
    const id = c.deal.person?.id ?? c.deal.customer?.id
    const name = c.deal.person?.nomeCompleto ?? c.deal.customer?.name
    if (id && name) owner.set(c.vehicleId, { key: `PF:${id}`, name, min: c.deal.consignMinValue == null ? null : Number(c.deal.consignMinValue) })
  }
  const repasse = new Map<string, { total: number; paid: number; paidDate: Date | null }>()
  for (const e of entries) {
    if (!e.vehicleId) continue
    const cur = repasse.get(e.vehicleId) ?? { total: 0, paid: 0, paidDate: null }
    const amt = Number(e.amount)
    // Título (sem pai) = saldo em aberto ou quitado; baixas parciais (filhos) = pagas.
    if (e.parentEntryId) { cur.total += amt; cur.paid += amt; cur.paidDate = e.paidDate ?? cur.paidDate }
    else if (e.status === 'PAGO') { cur.total += amt; cur.paid += amt; cur.paidDate = e.paidDate ?? cur.paidDate }
    else cur.total += amt
    repasse.set(e.vehicleId, cur)
  }

  const rows = new Map<string, PartnerRow>()
  for (const v of vehicles) {
    const o = v.partnerStore ? { key: `LJ:${v.partnerStore.id}`, name: v.partnerStore.name, kind: 'LOJA_PARCEIRA' as const, min: null }
      : owner.has(v.id) ? { ...owner.get(v.id)!, kind: 'PARTICULAR' as const }
      : { key: 'PF:?', name: 'Proprietário não informado', kind: 'PARTICULAR' as const, min: null }
    const row = rows.get(o.key) ?? { key: o.key, name: o.name, kind: o.kind, inStock: { count: 0, value: 0 }, toPay: { count: 0, value: 0 }, paid: { count: 0, value: 0 }, vehicles: [] }
    const rp = repasse.get(v.id)
    const base = rp?.total || Number(v.purchasePrice ?? 0) || (o.min ?? 0)
    const sold = SOLD.includes(String(v.stockStatus))
    const open = r2((rp?.total ?? base) - (rp?.paid ?? 0))
    const situation: PartnerVehicle['situation'] = !sold ? 'ESTOQUE' : open > 0.009 ? 'A_REPASSAR' : 'REPASSADO'
    if (situation === 'ESTOQUE') { row.inStock.count++; row.inStock.value = r2(row.inStock.value + base) }
    else if (situation === 'A_REPASSAR') { row.toPay.count++; row.toPay.value = r2(row.toPay.value + open) }
    if (rp?.paid) { row.paid.count++; row.paid.value = r2(row.paid.value + rp.paid) }
    row.vehicles.push({
      vehicleId: v.id, plate: v.plate, description: [v.brand, v.model, v.modelYear].filter(Boolean).join(' ') || 'Veículo', stockStatus: String(v.stockStatus),
      value: situation === 'A_REPASSAR' ? open : r2(base), situation, paidDate: rp?.paidDate ?? null, soldAt: sold ? v.exitDate : null,
    })
    rows.set(o.key, row)
  }
  const list = [...rows.values()].sort((a, b) => b.toPay.value - a.toPay.value || b.inStock.value - a.inStock.value)
  return {
    rows: list,
    totals: {
      partners: list.length, inStock: r2(list.reduce((s, r) => s + r.inStock.value, 0)),
      toPay: r2(list.reduce((s, r) => s + r.toPay.value, 0)), paid: r2(list.reduce((s, r) => s + r.paid.value, 0)),
    },
  }
}
