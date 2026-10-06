// =============================================================================
// Financeiro ← negociação de venda (VENDA/TROCA): pagamentos e débitos viram
// lançamentos assim que são cadastrados, sem esperar a finalização.
//   - DealPayment (sinal, entrada, PIX, financiamento…) → RECEITA, 1 por pagamento
//       PENDENTE → PREVISTO · CONFIRMADO → RECEBIDO (paidAt) · CANCELADO → CANCELADO
//   - Veículo recebido na troca → RECEITA (entrada da venda, recebida com o carro);
//       o carro da troca NÃO gera "Compra do veículo" a pagar — já foi pago com ele.
//   - DealDebt (documentação, cautelar, quitação da troca…) → DESPESA PREVISTO,
//       1 por débito: a loja paga ao terceiro (Detran, banco, despachante); quem
//       arca com ele já está no total da negociação. Documentação cobrada do
//       cliente → custo do serviço (21.1) no centro DOCUMENTACAO; o resto em VENDAS.
//   - DealService com custo → DESPESA PREVISTO (custo do serviço 21.x no centro
//       do tipo), chargedAmount = valor cobrado do cliente.
//   - WarrantySale com custo → DESPESA PREVISTO (21.5, centro GARANTIAS).
//   - F&I do financiamento (negociação aprovada em diante) → RECEITA PREVISTO:
//       retorno líquido (2.1), PLUS (2.5) e agregados com receita da loja.
// Idempotência pelo @@unique [dealId, source] (source = NEG_PGTO_<id> / NEG_DEBITO_<id> /
// NEG_TROCA_<id> / NEG_SERV_<id> / NEG_GAR_<id> / NEG_RETORNO_<id> / NEG_PLUS_<id> /
// NEG_AGREG_<id>_<i>).
// Negociação com lançamento VENDA (legado: total na finalização) ou importada
// (AutoConf/planilha) segue no modelo antigo — sem pagamentos, para não duplicar.
// Exceção: o F&I entra em todas, e nas importadas só quando o pagamento traz o retorno.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { isCommissionEligibleStatus } from '@/lib/commission/status'
import { isPayoffDebt } from './entry-settlement-core'
import { categoryIdByCode, resultCenterIds } from './setup'
import {
  FI_ADDON_SOURCE_PREFIX, FI_PLUS_CODE, FI_PLUS_SOURCE_PREFIX, FI_RETURN_CODE, FI_RETURN_SOURCE_PREFIX,
  SERVICE_SOURCE_PREFIX, WARRANTY_COST_CODE, WARRANTY_SOURCE_PREFIX,
  debtCenterSpec, fiDueDate, fiReturnAmount, isFiSource, isLiveWarrantySale, isSyncEditable, serviceCostSpec, storeAddOnRevenues,
} from './service-sync-core'

export const PAYMENT_SOURCE_PREFIX = 'NEG_PGTO_'
export const DEBT_SOURCE_PREFIX = 'NEG_DEBITO_'
/** Veículo recebido na troca = entrada da venda (pago com o carro, não com dinheiro). */
export const TRADE_SOURCE_PREFIX = 'NEG_TROCA_'
export { SERVICE_SOURCE_PREFIX, WARRANTY_SOURCE_PREFIX, FI_RETURN_SOURCE_PREFIX, FI_PLUS_SOURCE_PREFIX, FI_ADDON_SOURCE_PREFIX }
const paymentSource = (id: string) => `${PAYMENT_SOURCE_PREFIX}${id}`
const debtSource = (id: string) => `${DEBT_SOURCE_PREFIX}${id}`
export const isDealPaymentSource = (s: string | null | undefined) => !!s?.startsWith(PAYMENT_SOURCE_PREFIX)
export const paymentIdOfSource = (s: string) => s.slice(PAYMENT_SOURCE_PREFIX.length)

const SALE_TYPES = ['VENDA', 'TROCA']
const IMPORTED_SOURCES = ['AUTOCONF', 'PLANILHA']
const DEAD_STATUSES = ['CANCELADA', 'DESAPROVADA', 'RECUSADA', 'RASCUNHO']
/** Não entram dinheiro (quitação/troco são débitos da negociação). */
const NON_INCOMING = ['QUITACAO', 'TROCO']
/** Filhos da negociação no modelo novo (fora das importadas/legado). */
const CHILD_PREFIXES = [PAYMENT_SOURCE_PREFIX, DEBT_SOURCE_PREFIX, TRADE_SOURCE_PREFIX, SERVICE_SOURCE_PREFIX, WARRANTY_SOURCE_PREFIX]

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
  service: { name: 'Custo dos serviços vendidos', kind: 'DESPESA' as const },
  fi: { name: 'Retorno financeiro (F&I)', kind: 'RECEITA' as const },
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

const FI_DEAL_CANCEL_MARK = '[cancelado com a negociação]'

const paymentStatus = (s: string | null) => (s === 'CONFIRMADO' ? 'RECEBIDO' : s === 'CANCELADO' ? 'CANCELADO' : 'PREVISTO') as 'RECEBIDO' | 'CANCELADO' | 'PREVISTO'

/** Sincroniza os lançamentos de UMA negociação. Seguro chamar a qualquer momento. */
export async function syncDealFinance(dealId: string, cache: Map<string, string> = new Map()): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true, tenantId: true, unitId: true, sellerId: true, dealNumber: true, type: true, status: true, source: true,
      approvedAt: true, createdAt: true, tradeValue: true, returnNetValue: true,
      customer: { select: { name: true } },
      person: { select: { nomeCompleto: true } },
      payments: true, debts: true, services: true,
      warrantySales: { select: { id: true, status: true, finalPrice: true, costValue: true, createdAt: true, warranty: { select: { name: true, provider: true } } } },
      vehicles: { select: { id: true, role: true, plate: true, brand: true, model: true, vehicleId: true, agreedValue: true, evaluatedValue: true } },
    },
  })
  if (!deal || !SALE_TYPES.includes(deal.type)) return
  const imported = IMPORTED_SOURCES.includes(String(deal.source ?? '').toUpperCase())

  const entries = await prisma.financialEntry.findMany({
    where: { dealId },
    select: { id: true, source: true, status: true, chargedAmount: true, vehicleId: true, costCenterId: true, notes: true, _count: { select: { items: true } } },
  })
  // Legado (total da venda já lançado) e importadas: só o F&I.
  const children = !imported && !entries.some((e) => e.source === 'VENDA')

  const bySource = new Map(entries.map((e) => [e.source ?? '', e]))
  const dead = DEAD_STATUSES.includes(deal.status)
  const ref = deal.dealNumber ?? deal.id.slice(0, 8)
  // Cliente / pagador dos recebimentos (Person ?? Customer); sem nome, não apaga o que já existe.
  const customerName = deal.person?.nomeCompleto ?? deal.customer?.name ?? null
  const plateOf = (role: string | null) => deal.vehicles.find((v) => v.role === (role ?? 'VENDIDO'))?.plate ?? null
  const base = { tenantId: deal.tenantId, unitId: deal.unitId, sellerId: deal.sellerId, dealId: deal.id }
  const keep = new Set<string>()

  // Plano de contas / centros padrão da loja (preparados sob demanda; nunca derrubam a sync).
  let centersP: Promise<Record<string, string>> | null = null
  const centerId = async (key: string): Promise<string | null> => {
    if (!deal.tenantId) return null
    centersP ??= resultCenterIds(deal.tenantId).catch((e) => { console.error('[deal-finance-sync] centros', e); return {} })
    return (await centersP)[key] ?? null
  }
  const codeCategory = async (code: string): Promise<string | null> => {
    if (!deal.tenantId) return null
    const key = `code:${deal.tenantId}:${code}`
    const hit = cache.get(key)
    if (hit) return hit
    const id = await categoryIdByCode(deal.tenantId, code).catch(() => null)
    if (id) cache.set(key, id)
    return id
  }

  if (children) {
    const salesCenter = await centerId('VENDAS')

    // ── Pagamentos → RECEITA ──────────────────────────────────────────────
    for (const p of deal.payments) {
      if (NON_INCOMING.includes(p.type) || Number(p.value) <= 0) continue
      const source = paymentSource(p.id)
      keep.add(source)
      const kind = PAYMENT_LABEL[p.type] ?? p.type
      const how = p.method ? ` (${PAYMENT_LABEL[p.method] ?? p.method})` : p.bank ? ` (${p.bank})` : ''
      const plate = p.vehiclePlate ?? plateOf('VENDIDO')
      const status = dead && p.status !== 'CONFIRMADO' ? 'CANCELADO' : paymentStatus(p.status)
      // Financiamento: o banco paga; demais: o cliente da negociação.
      const party = p.type === 'FINANCIAMENTO' && p.bank ? p.bank : customerName
      const data = {
        description: `${kind}${how} — ${[ref, plate].filter(Boolean).join(' · ')}`,
        amount: p.value,
        status,
        dueDate: p.dueDate ?? p.firstDueDate ?? p.paidAt ?? null,
        paidDate: status === 'RECEBIDO' ? p.paidAt ?? new Date() : null,
        paymentMethod: p.method ?? p.type,
        ...(party ? { counterparty: party } : {}),
        documentNumber: p.authorizationCode ?? null,
      }
      const cur = bySource.get(source)
      if (cur) {
        // Valor ajustado na baixa (ex.: taxa do cartão): mantém o real, atualiza o cobrado.
        const { amount, ...rest } = data
        const center = cur.costCenterId ? {} : { costCenterId: salesCenter }
        await prisma.financialEntry.update({ where: { id: cur.id }, data: cur.chargedAmount != null ? { ...rest, ...center, chargedAmount: amount } : { ...data, ...center } })
      } else {
        await prisma.financialEntry.create({
          data: { ...base, ...data, source, type: 'RECEITA', competenceDate: p.createdAt, costCenterId: salesCenter, categoryId: await categoryId(deal.tenantId, CATEGORY.payment, cache) },
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
        paymentMethod: 'Veículo na troca', ...(customerName ? { counterparty: customerName } : {}),
      }
      const cur = bySource.get(source)
      if (cur) await prisma.financialEntry.update({ where: { id: cur.id }, data: cur.costCenterId ? data : { ...data, costCenterId: salesCenter } })
      else await prisma.financialEntry.create({ data: { ...base, ...data, source, type: 'RECEITA', competenceDate: when, costCenterId: salesCenter, categoryId: await categoryId(deal.tenantId, CATEGORY.payment, cache) } })
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
      const spec = debtCenterSpec(d)
      const costCenterId = await centerId(spec.centerKey)
      const codeCat = spec.costCode ? await codeCategory(spec.costCode) : null
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
        // Negociação cancelada: débito ainda em aberto é cancelado (mesmo já detalhado).
        if (dead && cur.status === 'PREVISTO') {
          await prisma.financialEntry.update({ where: { id: cur.id }, data: { status: 'CANCELADO' } })
        } else if (cur.chargedAmount != null || !isSyncEditable({ status: cur.status, itemCount: cur._count.items })) {
          if (cur.status !== 'CANCELADO') await prisma.financialEntry.update({ where: { id: cur.id }, data: { chargedAmount: d.value } })
        } else {
          await prisma.financialEntry.update({
            where: { id: cur.id },
            data: { ...data, costCenterId, ...(codeCat ? { categoryId: codeCat } : {}), ...(dead ? { status: 'CANCELADO' } : {}) },
          })
        }
      } else if (!dead) {
        await prisma.financialEntry.create({
          data: { ...base, ...data, vehicleId, source, type: 'DESPESA', status: 'PREVISTO', competenceDate: d.createdAt, costCenterId, categoryId: codeCat ?? await categoryId(deal.tenantId, CATEGORY.debt, cache) },
        })
      }
    }

    // ── Custo de serviço / garantia vendidos → DESPESA (cobrado × custo) ──
    type CostChild = {
      source: string; description: string; cost: number; charged: number; code: string; centerKey: string
      supplierId: string | null; counterparty: string | null; competenceDate: Date; notes: string
    }
    const costChildren: CostChild[] = []
    const supplierIds = [...new Set(deal.services.map((s) => s.supplierId).filter((x): x is string => !!x))]
    const suppliers = supplierIds.length
      ? new Map((await prisma.supplier.findMany({ where: { id: { in: supplierIds }, ...(deal.tenantId ? { tenantId: deal.tenantId } : {}) }, select: { id: true, name: true } })).map((s) => [s.id, s.name]))
      : new Map<string, string>()
    const plateRef = [ref, plateOf('VENDIDO')].filter(Boolean).join(' · ')
    for (const s of deal.services) {
      const cost = Number(s.cost ?? 0)
      if (!(cost > 0)) continue
      const spec = serviceCostSpec(s)
      const supplierId = s.supplierId && suppliers.has(s.supplierId) ? s.supplierId : null
      costChildren.push({
        source: `${SERVICE_SOURCE_PREFIX}${s.id}`, description: `Serviço: ${s.name} — ${plateRef}`,
        cost, charged: Number(s.value ?? 0), code: spec.costCode, centerKey: spec.centerKey,
        supplierId, counterparty: (supplierId ? suppliers.get(supplierId) : null) ?? s.supplier ?? null,
        competenceDate: s.createdAt, notes: `Serviço vendido na negociação ${ref}.`,
      })
    }
    for (const w of deal.warrantySales) {
      const cost = Number(w.costValue ?? 0)
      if (!isLiveWarrantySale(w.status) || !(cost > 0)) continue
      costChildren.push({
        source: `${WARRANTY_SOURCE_PREFIX}${w.id}`, description: `Garantia: ${w.warranty?.name ?? 'garantia'} — ${plateRef}`,
        cost, charged: Number(w.finalPrice ?? 0), code: WARRANTY_COST_CODE, centerKey: 'GARANTIAS',
        supplierId: null, counterparty: w.warranty?.provider ?? w.warranty?.name ?? null,
        competenceDate: w.createdAt, notes: `Garantia vendida na negociação ${ref}.`,
      })
    }
    for (const c of costChildren) {
      keep.add(c.source)
      const cur = bySource.get(c.source)
      const costCenterId = await centerId(c.centerKey)
      const catId = (await codeCategory(c.code)) ?? await categoryId(deal.tenantId, CATEGORY.service, cache)
      const data = {
        description: c.description, amount: c.cost, chargedAmount: c.charged, categoryId: catId, costCenterId,
        supplierId: c.supplierId, counterparty: c.counterparty, notes: c.notes,
      }
      if (cur) {
        if (dead && cur.status === 'PREVISTO') {
          await prisma.financialEntry.update({ where: { id: cur.id }, data: { status: 'CANCELADO' } })
        } else if (isSyncEditable({ status: cur.status, itemCount: cur._count.items })) {
          await prisma.financialEntry.update({ where: { id: cur.id }, data })
        } else if (cur.status !== 'CANCELADO') {
          // Custo real detalhado/baixado: só o valor cobrado acompanha a negociação.
          await prisma.financialEntry.update({ where: { id: cur.id }, data: { chargedAmount: c.charged } })
        }
      } else if (!dead) {
        await prisma.financialEntry.create({
          data: { ...base, ...data, source: c.source, type: 'DESPESA', status: 'PREVISTO', competenceDate: c.competenceDate },
        })
      }
    }
  }

  // ── F&I do financiamento → RECEITA PREVISTO (aprovada em diante) ──────────
  if (isCommissionEligibleStatus(deal.status)) {
    const approvedAt = deal.approvedAt ?? deal.createdAt
    const financing = deal.payments.filter((p) => p.type === 'FINANCIAMENTO' && p.status !== 'CANCELADO')
    const fiCenter = await centerId('FI')
    for (const p of financing) {
      // Importada: só quando o próprio pagamento traz o retorno (AutoConf).
      if (imported && p.returnNetValue == null) continue
      const common = {
        dueDate: fiDueDate(p, approvedAt),
        counterparty: p.bank ?? null,
        documentNumber: p.contractNumber ?? null,
      }
      const bankRef = [p.bank, ref, plateOf('VENDIDO')].filter(Boolean).join(' · ')
      const revenues: Array<{ source: string; description: string; amount: number; code: string; costCenterId: string | null }> = []
      const ret = fiReturnAmount(p.returnNetValue, deal.returnNetValue, financing.length)
      if (ret != null) revenues.push({ source: `${FI_RETURN_SOURCE_PREFIX}${p.id}`, description: `Retorno do financiamento — ${bankRef}`, amount: ret, code: FI_RETURN_CODE, costCenterId: fiCenter })
      const plus = Number(p.plusValue ?? 0)
      if (plus > 0) revenues.push({ source: `${FI_PLUS_SOURCE_PREFIX}${p.id}`, description: `PLUS do contrato — ${bankRef}`, amount: plus, code: FI_PLUS_CODE, costCenterId: fiCenter })
      for (const a of storeAddOnRevenues(p.addOns)) {
        revenues.push({ source: `${FI_ADDON_SOURCE_PREFIX}${p.id}_${a.index}`, description: `Agregado: ${a.name} — ${bankRef}`, amount: a.amount, code: a.revenueCode, costCenterId: await centerId(a.centerKey) })
      }
      for (const r of revenues) {
        keep.add(r.source)
        const cur = bySource.get(r.source)
        // Recebido, ou cancelado à mão pelo financeiro (ex.: banco não pagou o PLUS): não mexe mais.
        // Cancelado pela própria negociação (marca FI_DEAL_CANCEL_MARK) volta se ela reviver.
        if (cur && (cur.status === 'RECEBIDO' || cur.status === 'PAGO' || (cur.status === 'CANCELADO' && !(cur.notes ?? '').includes(FI_DEAL_CANCEL_MARK)))) continue
        const categoryIdFi = (await codeCategory(r.code)) ?? await categoryId(deal.tenantId, CATEGORY.fi, cache)
        const data = {
          ...common, description: r.description, status: 'PREVISTO' as const,
          // Revivendo o que a negociação cancelou: tira a marca.
          ...(cur?.status === 'CANCELADO' ? { notes: (cur.notes ?? '').replace(FI_DEAL_CANCEL_MARK, '').trim() || null } : {}),
        }
        if (cur) {
          // Valor ajustado no financeiro: mantém o real, atualiza o previsto.
          await prisma.financialEntry.update({
            where: { id: cur.id },
            data: cur.chargedAmount != null ? { ...data, chargedAmount: r.amount } : { ...data, amount: r.amount, categoryId: categoryIdFi, costCenterId: r.costCenterId },
          })
        } else {
          await prisma.financialEntry.create({
            data: { ...base, ...data, source: r.source, type: 'RECEITA', amount: r.amount, competenceDate: approvedAt, categoryId: categoryIdFi, costCenterId: r.costCenterId },
          })
        }
      }
    }
  }

  // ── Filho apagado/cancelado na negociação → some o previsto ───────────
  for (const o of entries) {
    const s = o.source ?? ''
    if (keep.has(s)) continue
    if (children && CHILD_PREFIXES.some((p) => s.startsWith(p))) {
      if (o.status === 'PREVISTO' || s.startsWith(TRADE_SOURCE_PREFIX)) await prisma.financialEntry.delete({ where: { id: o.id } })
    } else if (isFiSource(s) && o.status === 'PREVISTO') {
      // Negociação cancelada: o recebível de F&I é cancelado; senão (reaberta, sem retorno) some.
      if (dead) await prisma.financialEntry.update({ where: { id: o.id }, data: { status: 'CANCELADO', notes: [o.notes, FI_DEAL_CANCEL_MARK].filter(Boolean).join(' ') } })
      else await prisma.financialEntry.delete({ where: { id: o.id } })
    }
  }
}

/** Todas as negociações de venda do escopo (sync manual / pós-finalização). */
export async function syncDealsFinance(dealWhere: Record<string, unknown>): Promise<void> {
  const deals = await prisma.deal.findMany({
    where: {
      ...dealWhere,
      type: { in: SALE_TYPES },
      OR: [{ payments: { some: {} } }, { debts: { some: {} } }, { services: { some: {} } }, { warrantySales: { some: {} } }],
    } as never,
    select: { id: true, source: true, payments: { where: { type: 'FINANCIAMENTO', returnNetValue: { not: null } }, select: { id: true }, take: 1 } },
  })
  const cache = new Map<string, string>()
  for (const d of deals) {
    // Importadas: só entram pelo F&I (retorno vindo do AutoConf).
    if (IMPORTED_SOURCES.includes(String(d.source ?? '').toUpperCase()) && d.payments.length === 0) continue
    await syncDealFinance(d.id, cache).catch((e) => console.error('[deal-finance-sync]', d.id, e))
  }
}

/** Fire-and-forget seguro para rotas: nunca derruba a resposta. */
export async function syncDealFinanceSafe(dealId: string | null | undefined) {
  if (!dealId) return
  await syncDealFinance(dealId).catch((e) => console.error('[deal-finance-sync]', dealId, e))
}
