// =============================================================================
// Financeiro ← negociação de venda (VENDA/TROCA): pagamentos e débitos viram
// lançamentos assim que são cadastrados, sem esperar a finalização.
//   - DealPayment (sinal, entrada, PIX, financiamento…) → RECEITA, 1 por pagamento
//       PENDENTE → PREVISTO · CONFIRMADO → RECEBIDO (paidAt) · CANCELADO → CANCELADO
//   - Veículo recebido na troca → RECEITA (entrada da venda, recebida com o carro);
//       o carro da troca NÃO gera "Compra do veículo" a pagar — já foi pago com ele.
//   - DealDebt (documentação, cautelar, quitação da troca…) → DESPESA PREVISTO,
//       1 por débito: a loja paga ao terceiro (Detran, banco, despachante); quem
//       arca com ele já está no total da negociação.
// Idempotência pelo @@unique [dealId, source] (source = NEG_PGTO_<id> / NEG_DEBITO_<id>).
// Negociação com lançamento VENDA (legado: total na finalização) ou importada
// (AutoConf/planilha) segue no modelo antigo — sem pagamentos, para não duplicar.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { isPayoffDebt } from './entry-settlement-core'

export const PAYMENT_SOURCE_PREFIX = 'NEG_PGTO_'
export const DEBT_SOURCE_PREFIX = 'NEG_DEBITO_'
/** Veículo recebido na troca = entrada da venda (pago com o carro, não com dinheiro). */
export const TRADE_SOURCE_PREFIX = 'NEG_TROCA_'
const paymentSource = (id: string) => `${PAYMENT_SOURCE_PREFIX}${id}`
const debtSource = (id: string) => `${DEBT_SOURCE_PREFIX}${id}`
export const isDealPaymentSource = (s: string | null | undefined) => !!s?.startsWith(PAYMENT_SOURCE_PREFIX)
export const paymentIdOfSource = (s: string) => s.slice(PAYMENT_SOURCE_PREFIX.length)

const SALE_TYPES = ['VENDA', 'TROCA']
const IMPORTED_SOURCES = ['AUTOCONF', 'PLANILHA']
const DEAD_STATUSES = ['CANCELADA', 'DESAPROVADA', 'RECUSADA', 'RASCUNHO']
/** Não entram dinheiro (quitação/troco são débitos da negociação). */
const NON_INCOMING = ['QUITACAO', 'TROCO']

const PAYMENT_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro', PIX: 'PIX', SINAL: 'Sinal', ENTRADA: 'Entrada', FINANCIAMENTO: 'Financiamento',
  CARTAO_CREDITO: 'Cartão de crédito', CARTAO_DEBITO: 'Cartão de débito', BOLETO: 'Boleto', DUPLICATA: 'Duplicata',
  TRANSFERENCIA: 'Transferência', OUTRO: 'Outro', OUTROS: 'Outro',
}
const DEBT_LABEL: Record<string, string> = {
  MULTA: 'Multa', IPVA: 'IPVA', LICENCIAMENTO: 'Licenciamento', FINANCIAMENTO: 'Quitação de financiamento',
  DOCUMENTACAO: 'Documentação', DESPACHANTE: 'Despachante', CAUTELAR: 'Cautelar', REPARO: 'Reparo', OUTROS: 'Outros',
}
const RESP_LABEL: Record<string, string> = { COMPRADOR: 'comprador', CLIENTE: 'comprador', VENDEDOR: 'vendedor', LOJA: 'loja' }

const CATEGORY = {
  payment: { name: 'Vendas', kind: 'RECEITA' as const },
  debt: { name: 'Débitos de negociações', kind: 'DESPESA' as const },
}

async function categoryId(tenantId: string | null, def: { name: string; kind: 'RECEITA' | 'DESPESA' }, cache: Map<string, string>) {
  const key = `${tenantId}:${def.kind}:${def.name}`
  const hit = cache.get(key)
  if (hit) return hit
  let cat = await prisma.financialCategory.findFirst({ where: { tenantId, name: def.name, kind: def.kind }, select: { id: true } })
  if (!cat) cat = await prisma.financialCategory.create({ data: { tenantId, name: def.name, kind: def.kind }, select: { id: true } })
  cache.set(key, cat.id)
  return cat.id
}

const paymentStatus = (s: string | null) => (s === 'CONFIRMADO' ? 'RECEBIDO' : s === 'CANCELADO' ? 'CANCELADO' : 'PREVISTO') as 'RECEBIDO' | 'CANCELADO' | 'PREVISTO'

/** Sincroniza os lançamentos de UMA negociação. Seguro chamar a qualquer momento. */
export async function syncDealFinance(dealId: string, cache: Map<string, string> = new Map()): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true, tenantId: true, unitId: true, sellerId: true, dealNumber: true, type: true, status: true, source: true,
      approvedAt: true, createdAt: true, tradeValue: true,
      customer: { select: { name: true } },
      payments: true, debts: true,
      vehicles: { select: { id: true, role: true, plate: true, brand: true, model: true, vehicleId: true, agreedValue: true, evaluatedValue: true } },
    },
  })
  if (!deal || !SALE_TYPES.includes(deal.type) || IMPORTED_SOURCES.includes(String(deal.source ?? '').toUpperCase())) return

  const entries = await prisma.financialEntry.findMany({
    where: { dealId },
    select: { id: true, source: true, status: true, chargedAmount: true, vehicleId: true },
  })
  if (entries.some((e) => e.source === 'VENDA')) return // legado: total da venda já lançado

  const bySource = new Map(entries.map((e) => [e.source ?? '', e]))
  const dead = DEAD_STATUSES.includes(deal.status)
  const ref = deal.dealNumber ?? deal.id.slice(0, 8)
  const plateOf = (role: string | null) => deal.vehicles.find((v) => v.role === (role ?? 'VENDIDO'))?.plate ?? null
  const base = { tenantId: deal.tenantId, unitId: deal.unitId, sellerId: deal.sellerId, dealId: deal.id }
  const keep = new Set<string>()

  // ── Pagamentos → RECEITA ──────────────────────────────────────────────
  for (const p of deal.payments) {
    if (NON_INCOMING.includes(p.type) || Number(p.value) <= 0) continue
    const source = paymentSource(p.id)
    keep.add(source)
    const kind = PAYMENT_LABEL[p.type] ?? p.type
    const how = p.method ? ` (${PAYMENT_LABEL[p.method] ?? p.method})` : p.bank ? ` (${p.bank})` : ''
    const plate = p.vehiclePlate ?? plateOf('VENDIDO')
    const status = dead && p.status !== 'CONFIRMADO' ? 'CANCELADO' : paymentStatus(p.status)
    const data = {
      description: `${kind}${how} — ${[ref, plate].filter(Boolean).join(' · ')}`,
      amount: p.value,
      status,
      dueDate: p.dueDate ?? p.firstDueDate ?? p.paidAt ?? null,
      paidDate: status === 'RECEBIDO' ? p.paidAt ?? new Date() : null,
      paymentMethod: p.method ?? p.type,
      counterparty: p.type === 'FINANCIAMENTO' && p.bank ? p.bank : deal.customer?.name ?? null,
      documentNumber: p.authorizationCode ?? null,
    }
    const cur = bySource.get(source)
    if (cur) {
      // Valor ajustado na baixa (ex.: taxa do cartão): mantém o real, atualiza o cobrado.
      const { amount, ...rest } = data
      await prisma.financialEntry.update({ where: { id: cur.id }, data: cur.chargedAmount != null ? { ...rest, chargedAmount: amount } : data })
    } else {
      await prisma.financialEntry.create({
        data: { ...base, ...data, source, type: 'RECEITA', competenceDate: p.createdAt, categoryId: await categoryId(deal.tenantId, CATEGORY.payment, cache) },
      })
    }
  }

  // ── Veículo na troca → RECEITA (entrada da venda) ────────────────────
  const trades = deal.vehicles.filter((v) => v.role === 'TROCA')
  for (const t of trades) {
    const value = Number(t.agreedValue ?? t.evaluatedValue ?? (trades.length === 1 ? deal.tradeValue : 0) ?? 0)
    if (!(value > 0)) continue
    const source = `${TRADE_SOURCE_PREFIX}${t.id}`
    keep.add(source)
    const when = deal.approvedAt ?? deal.createdAt
    const status: 'CANCELADO' | 'RECEBIDO' = dead ? 'CANCELADO' : 'RECEBIDO'
    const data = {
      description: `Veículo na troca — ${[t.plate, [t.brand, t.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')} · ${ref}`,
      amount: value, status, dueDate: when, paidDate: status === 'RECEBIDO' ? when : null,
      paymentMethod: 'Veículo na troca', counterparty: deal.customer?.name ?? null,
    }
    const cur = bySource.get(source)
    if (cur) await prisma.financialEntry.update({ where: { id: cur.id }, data })
    else await prisma.financialEntry.create({ data: { ...base, ...data, source, type: 'RECEITA', competenceDate: when, categoryId: await categoryId(deal.tenantId, CATEGORY.payment, cache) } })
    // O carro da troca já foi pago com ele mesmo: some a "Compra do veículo" a pagar.
    if (t.vehicleId && !dead) {
      await prisma.financialEntry.deleteMany({ where: { vehicleId: t.vehicleId, source: 'VEICULO_COMPRA_VEICULO', status: 'PREVISTO' } })
    }
  }

  // ── Débitos → DESPESA (a loja paga ao terceiro) ───────────────────────
  for (const d of deal.debts) {
    if (Number(d.value) <= 0) continue
    const source = debtSource(d.id)
    keep.add(source)
    const label = d.description?.trim() || DEBT_LABEL[d.type] || d.type
    const role = d.vehicleRole === 'TROCA' ? 'veículo da troca' : 'veículo vendido'
    const resp = RESP_LABEL[String(d.responsavel ?? '').toUpperCase()]
    // Débito entra no extrato do veículo — menos a quitação do carro da troca, que
    // já compõe o valor de compra dele (seria custo em dobro).
    const vehicleId = isPayoffDebt(d) ? null : deal.vehicles.find((v) => v.role === (d.vehicleRole ?? 'VENDIDO'))?.vehicleId ?? null
    const data = {
      description: `${label} — ${role} ${plateOf(d.vehicleRole) ?? ''}`.trim() + ` · ${ref}`,
      amount: d.value,
      dueDate: d.dueDate ?? null,
      notes: resp ? `Débito da negociação ${ref} — responsável: ${resp}.` : `Débito da negociação ${ref}.`,
    }
    const cur = bySource.get(source)
    if (cur) {
      if (cur.vehicleId !== vehicleId) await prisma.financialEntry.update({ where: { id: cur.id }, data: { vehicleId } })
      // Custo real já detalhado/baixado: o débito só atualiza o valor COBRADO.
      if (cur.chargedAmount != null || cur.status !== 'PREVISTO') {
        if (cur.status !== 'CANCELADO') await prisma.financialEntry.update({ where: { id: cur.id }, data: { chargedAmount: d.value } })
      } else {
        await prisma.financialEntry.update({ where: { id: cur.id }, data: { ...data, ...(dead ? { status: 'CANCELADO' } : {}) } })
      }
    } else if (!dead) {
      await prisma.financialEntry.create({
        data: { ...base, ...data, vehicleId, source, type: 'DESPESA', status: 'PREVISTO', competenceDate: d.createdAt, categoryId: await categoryId(deal.tenantId, CATEGORY.debt, cache) },
      })
    }
  }

  // ── Pagamento/débito apagado na negociação → some o previsto ──────────
  const orphans = entries.filter((e) => (e.source?.startsWith(PAYMENT_SOURCE_PREFIX) || e.source?.startsWith(DEBT_SOURCE_PREFIX) || e.source?.startsWith(TRADE_SOURCE_PREFIX)) && !keep.has(e.source!))
  for (const o of orphans) {
    if (o.status === 'PREVISTO' || o.source?.startsWith(TRADE_SOURCE_PREFIX)) await prisma.financialEntry.delete({ where: { id: o.id } })
  }
}

/** Todas as negociações de venda do escopo (sync manual / pós-finalização). */
export async function syncDealsFinance(dealWhere: Record<string, unknown>): Promise<void> {
  const deals = await prisma.deal.findMany({
    where: {
      ...dealWhere,
      type: { in: SALE_TYPES },
      OR: [{ payments: { some: {} } }, { debts: { some: {} } }],
    } as never,
    select: { id: true, source: true },
  })
  const cache = new Map<string, string>()
  for (const d of deals) {
    if (IMPORTED_SOURCES.includes(String(d.source ?? '').toUpperCase())) continue
    await syncDealFinance(d.id, cache).catch((e) => console.error('[deal-finance-sync]', d.id, e))
  }
}

/** Fire-and-forget seguro para rotas: nunca derruba a resposta. */
export async function syncDealFinanceSafe(dealId: string | null | undefined) {
  if (!dealId) return
  await syncDealFinance(dealId).catch((e) => console.error('[deal-finance-sync]', dealId, e))
}
