// =============================================================================
// Extrato financeiro do veículo — tudo que o carro custou e rendeu.
//   • Lançamentos do Financeiro com vehicleId (compra/repasse, serviços,
//     documentação, multas, débitos, peças, combustível, laudos, terceiros,
//     prestadores, impostos…) — os mesmos de Financeiro › Lançamentos/DRE.
//   • Venda: negociação de venda do carro (lançamento VENDA do financeiro
//     quando existir; senão o valor da negociação, como previsto).
//   • Comissões: lidas AO VIVO do sistema de comissões pela negociação de venda
//     — quando a comissão é paga lá, aparece baixada aqui.
// Regras de cálculo em prep-core.vehicleResult (testado).
// =============================================================================

import type { FinancialEntryStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { EXPENSE_LABEL, REVENUE_LABEL, serviceCost, vehicleResult, type ExpenseCategory } from './prep-core'
import { listVehicleFiles, type VehicleFileMeta } from './vehicle-files'

export const VEHICLE_SOURCE_PREFIX = 'VEICULO_'
export const sourceOf = (category: string) => `${VEHICLE_SOURCE_PREFIX}${category}`
export const categoryOf = (source: string | null) => (source?.startsWith(VEHICLE_SOURCE_PREFIX) ? source.slice(VEHICLE_SOURCE_PREFIX.length) : source ?? 'OUTRO')

const catCache = new Map<string, string>()

/** Categoria do Financeiro para o tipo de gasto do veículo (criada sob demanda). */
export async function ensureVehicleCategory(tenantId: string | null, category: string, kind: 'RECEITA' | 'DESPESA'): Promise<string> {
  const label = kind === 'DESPESA' ? (EXPENSE_LABEL[category as ExpenseCategory] ?? 'Outros') : (REVENUE_LABEL[category] ?? 'Outras receitas')
  const name = `Veículos — ${label}`
  const key = `${tenantId}:${kind}:${name}`
  const hit = catCache.get(key)
  if (hit) return hit
  let cat = await prisma.financialCategory.findFirst({ where: { tenantId, name, kind }, select: { id: true } })
  if (!cat) cat = await prisma.financialCategory.create({ data: { tenantId, name, kind }, select: { id: true } })
  catCache.set(key, cat.id)
  return cat.id
}

function plateLabel(v: { plate: string | null; brand: string | null; model: string | null }) {
  return [v.plate, [v.brand, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
}

/** Lançamento de compra (estoque próprio) ou repasse ao proprietário (consignado) na entrada. */
export async function createAcquisitionEntry(vehicleId: string, createdById: string | null) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, tenantId: true, unitId: true, plate: true, brand: true, model: true, stockType: true, purchasePrice: true } })
  if (!v || v.purchasePrice == null || Number(v.purchasePrice) <= 0) return
  const category = v.stockType === 'CONSIGNADO' ? 'REPASSE' : 'COMPRA_VEICULO'
  const exists = await prisma.financialEntry.findFirst({ where: { vehicleId, source: sourceOf(category), status: { not: 'CANCELADO' } }, select: { id: true } })
  if (exists) return
  await prisma.financialEntry.create({
    data: {
      tenantId: v.tenantId, unitId: v.unitId, vehicleId, type: 'DESPESA', status: 'PREVISTO', source: sourceOf(category),
      categoryId: await ensureVehicleCategory(v.tenantId, category, 'DESPESA'),
      description: `${category === 'REPASSE' ? 'Repasse ao proprietário (na venda)' : 'Compra do veículo'} — ${plateLabel(v)}`,
      amount: v.purchasePrice, competenceDate: new Date(), dueDate: category === 'REPASSE' ? null : new Date(), createdById,
    },
  })
}

/**
 * Serviço de preparação → despesa no Financeiro (1 por serviço).
 * Aguardando = sem lançamento; em serviço/concluído = previsto (valor real ou previsto);
 * negado/cancelado = lançamento cancelado. O que já foi PAGO nunca é desfeito.
 */
export async function syncServiceEntry(serviceId: string, actorId: string | null = null) {
  const s = await prisma.vehicleService.findUnique({
    where:   { id: serviceId },
    include: { supplier: { select: { name: true } }, vehicle: { select: { tenantId: true, unitId: true, plate: true, brand: true, model: true } } },
  })
  if (!s) return
  const existing = await prisma.financialEntry.findUnique({ where: { vehicleServiceId: s.id } })
  const amount = serviceCost({ status: s.status, estimatedCost: s.estimatedCost == null ? null : Number(s.estimatedCost), actualCost: s.actualCost == null ? null : Number(s.actualCost) })
  const active = s.status === 'EM_SERVICO' || s.status === 'CONCLUIDO'
  const description = `Serviço: ${s.description} — ${plateLabel(s.vehicle)}`

  if (!existing) {
    if (!active || amount <= 0) return
    await prisma.financialEntry.create({
      data: {
        tenantId: s.vehicle.tenantId, unitId: s.vehicle.unitId, vehicleId: s.vehicleId, vehicleServiceId: s.id,
        type: 'DESPESA', status: 'PREVISTO', source: sourceOf('SERVICO'),
        categoryId: await ensureVehicleCategory(s.vehicle.tenantId, 'SERVICO', 'DESPESA'),
        description, amount, counterparty: s.supplier?.name ?? null,
        competenceDate: s.finishedAt ?? new Date(), dueDate: s.finishedAt ?? s.dueAt ?? null, createdById: actorId,
      },
    })
    return
  }
  if (existing.status === 'PAGO') {
    // Já pago: só atualiza texto/fornecedor (valor pago fica como foi pago).
    await prisma.financialEntry.update({ where: { id: existing.id }, data: { description, counterparty: s.supplier?.name ?? existing.counterparty } })
    return
  }
  const status: FinancialEntryStatus = active && amount > 0 ? 'PREVISTO' : 'CANCELADO'
  await prisma.financialEntry.update({
    where: { id: existing.id },
    data:  { status, amount: amount > 0 ? amount : existing.amount, description, counterparty: s.supplier?.name ?? null, dueDate: s.finishedAt ?? s.dueAt ?? existing.dueDate },
  })
}

export interface LedgerLine {
  id: string
  origin: 'ENTRY' | 'SALE' | 'COMMISSION'
  entryId: string | null
  type: 'RECEITA' | 'DESPESA'
  category: string
  categoryLabel: string
  description: string
  amount: number
  status: string
  dueDate: string | null
  paidDate: string | null
  counterparty: string | null
  paymentMethod: string | null
  dealNumber: string | null
  locked: string | null // motivo de não editar o valor aqui (serviço, comissão…)
  receipts: VehicleFileMeta[]
}

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d))
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export async function loadVehicleLedger(vehicleId: string) {
  const v = await prisma.vehicle.findUnique({
    where:  { id: vehicleId },
    select: { id: true, tenantId: true, plate: true, brand: true, model: true, stockType: true, stockStatus: true, purchasePrice: true, salePrice: true, entryDate: true, exitDate: true },
  })
  if (!v) return null

  const [entries, saleRows, receipts] = await Promise.all([
    prisma.financialEntry.findMany({ where: { vehicleId }, orderBy: [{ createdAt: 'asc' }] }),
    prisma.dealVehicle.findMany({
      where:  { vehicleId, role: 'VENDIDO', deal: { status: { not: 'CANCELADA' } } },
      select: { deal: { select: { id: true, dealNumber: true, status: true, saleAmount: true, finalizedAt: true, saleDate: true, createdAt: true } } },
    }),
    listVehicleFiles(vehicleId, 'COMPROVANTE'),
  ])
  const receiptsBy = new Map<string, VehicleFileMeta[]>()
  for (const r of receipts) if (r.refKey) receiptsBy.set(r.refKey, [...(receiptsBy.get(r.refKey) ?? []), r])

  const lines: LedgerLine[] = entries.map((e) => {
    const category = categoryOf(e.source)
    return {
      id: e.id, origin: 'ENTRY', entryId: e.id, type: e.type, category,
      categoryLabel: e.type === 'DESPESA' ? (EXPENSE_LABEL[category as ExpenseCategory] ?? category) : (REVENUE_LABEL[category] ?? category),
      description: e.description, amount: num(e.amount), status: e.status, dueDate: iso(e.dueDate), paidDate: iso(e.paidDate),
      counterparty: e.counterparty, paymentMethod: e.paymentMethod, dealNumber: null,
      locked: e.vehicleServiceId ? 'Valor do serviço: altere na aba Serviços.' : null,
      receipts: receiptsBy.get(e.id) ?? [],
    }
  })

  const deals = saleRows.map((r) => r.deal)
  for (const d of deals) {
    const fin = await prisma.financialEntry.findFirst({ where: { dealId: d.id, source: 'VENDA' } })
    const amount = fin ? num(fin.amount) : num(d.saleAmount)
    if (amount > 0) {
      lines.push({
        id: `venda:${d.id}`, origin: 'SALE', entryId: fin?.id ?? null, type: 'RECEITA', category: 'VENDA_VEICULO', categoryLabel: 'Venda do veículo',
        description: `Venda — negociação ${d.dealNumber ?? d.id.slice(0, 8)}`, amount,
        status: fin?.status ?? (d.status === 'FINALIZADA' ? 'RECEBIDO' : 'PREVISTO'),
        dueDate: iso(d.saleDate ?? d.createdAt), paidDate: iso(fin?.paidDate ?? d.finalizedAt), counterparty: null, paymentMethod: fin?.paymentMethod ?? null,
        dealNumber: d.dealNumber, locked: 'Venda: vem da negociação.', receipts: fin ? receiptsBy.get(fin.id) ?? [] : [],
      })
    }
    // Comissões da venda — status ao vivo do sistema de comissões.
    const comms = await prisma.commissionCalculation.findMany({
      where:  { tenantId: v.tenantId, status: { not: 'CANCELADO' }, ruleDetails: { path: ['dealId'], equals: d.id } as never },
      select: { id: true, description: true, commissionValue: true, status: true, paidAt: true, createdAt: true, ruleType: true },
    })
    for (const c of comms) {
      lines.push({
        id: `comissao:${c.id}`, origin: 'COMMISSION', entryId: null, type: 'DESPESA', category: 'COMISSAO', categoryLabel: 'Comissões',
        description: c.description || `Comissão ${c.ruleType}`, amount: num(c.commissionValue), status: c.status === 'PAGO' ? 'PAGO' : 'PREVISTO',
        dueDate: iso(c.createdAt), paidDate: iso(c.paidAt), counterparty: null, paymentMethod: null, dealNumber: d.dealNumber,
        locked: 'Comissão: baixa automática quando paga no sistema de comissões.', receipts: [],
      })
    }
  }

  const result = vehicleResult(lines.map((l) => ({ type: l.type, category: l.category, amount: l.amount, status: l.status })))
  return {
    vehicle: {
      id: v.id, plate: v.plate, title: [v.brand, v.model].filter(Boolean).join(' '), stockType: v.stockType, stockStatus: v.stockStatus,
      purchasePrice: v.purchasePrice == null ? null : num(v.purchasePrice), salePrice: v.salePrice == null ? null : num(v.salePrice),
      entryDate: iso(v.entryDate), exitDate: iso(v.exitDate), dealNumbers: deals.map((d) => d.dealNumber).filter(Boolean),
    },
    lines: lines.sort((a, b) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? ''))),
    result,
  }
}
