// =============================================================================
// Centros de resultado — carga (Prisma) + classificação dos lançamentos.
//   • centro de cada lançamento: o escolhido no lançamento vence; senão a
//     categoria do plano (4.x/21.x/2.x…) e, por fim, a origem (deriveCenterKey)
//     com o contexto do banco (tipo do débito, tipo do serviço, regra da comissão);
//   • recebimentos de negociação (NEG_PGTO_/NEG_TROCA_/VENDA) rateados entre
//     veículo, documentação cobrada e cada serviço (splitReceipt);
//   • custo de serviço vendido (NEG_SERV_, NEG_GAR_, débito de documentação
//     cobrado do cliente) → CMV_SERVICOS: não é custo do carro, não vai para o
//     mês da venda nem para o "custo em estoque".
// Usado pela DRE e pelos relatórios (não pelo fluxo de caixa).
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { FinanceRefs } from './dre'
import type { RawEntry } from './reports-core'
import {
  SERVICE_KIND_BY_KEY, centerKeyByCategoryCode, dealRevenueComponents, deriveCenterKey, isChargedDocDebt, isDocDebtType,
  serviceKindOf, splitReceipt, type CenterContext, type RevenueComponent,
} from './result-centers-core'

const CHUNK = 5000
async function inChunks<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  const uniq = [...new Set(ids)]
  for (let i = 0; i < uniq.length; i += CHUNK) out.push(...(await load(uniq.slice(i, i + CHUNK))))
  return out
}

export const isDealReceiptSource = (s: string | null | undefined) =>
  s === 'VENDA' || !!s?.startsWith('NEG_PGTO_') || !!s?.startsWith('NEG_TROCA_')

const AUTO_SOURCE = /^(NEG_|VEICULO_|VENDA$|COMISSAO$|RETORNO$|GARANTIA$)/

export interface CommissionRef { ruleType: string; dealId: string | null; serviceId: string | null; warrantySaleId: string | null }

export const commissionRefOf = (c: { ruleType: string; ruleDetails: unknown }): CommissionRef => {
  const rd = (c.ruleDetails && typeof c.ruleDetails === 'object' ? c.ruleDetails : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return { ruleType: String(c.ruleType), dealId: str(rd.dealId), serviceId: str(rd.serviceId), warrantySaleId: str(rd.warrantySaleId) }
}

/** Grupo da DRE de uma categoria de receita do plano, pelo código. */
function revenueGroup(refs: FinanceRefs, code: string, categoryId: string | null): string {
  const g = categoryId ? refs.groupOf({ type: 'RECEITA', source: null, categoryId }) : null
  if (g && g !== 'REC_OUTRAS') return g
  return code.startsWith('2.') ? 'REC_FI' : 'REC_SERVICOS'
}

/**
 * Centro, rateio dos recebimentos e grupo dos custos de serviço. Devolve uma
 * nova lista (um recebimento rateado vira N partes com o mesmo id e `part`).
 */
export async function classifyEntries(
  tenantId: string, raw: RawEntry[], refs: FinanceRefs,
  opts: { split?: boolean; /** Recebimento que pode entrar no relatório (evita carregar negociações de fora do período). */ relevant?: (e: RawEntry) => boolean } = {},
): Promise<RawEntry[]> {
  const split = opts.split !== false
  const relevant = opts.relevant ?? (() => true)
  const debtIds: string[] = [], serviceIds: string[] = [], commissionIds: string[] = [], dealIds: string[] = []
  for (const e of raw) {
    const s = e.source ?? ''
    if (s.startsWith('NEG_DEBITO_')) debtIds.push(s.slice(11))
    else if (s.startsWith('NEG_SERV_')) serviceIds.push(s.slice(9))
    if (e.commissionCalculationId) commissionIds.push(e.commissionCalculationId)
    if (split && e.type === 'RECEITA' && e.dealId && isDealReceiptSource(s) && relevant(e)) dealIds.push(e.dealId)
  }

  const [debts, commissions, deals] = await Promise.all([
    debtIds.length ? inChunks(debtIds, (ids) => prisma.dealDebt.findMany({ where: { id: { in: ids } }, select: { id: true, type: true, responsavel: true } })) : [],
    commissionIds.length ? inChunks(commissionIds, (ids) => prisma.commissionCalculation.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, ruleType: true, ruleDetails: true } })) : [],
    dealIds.length
      ? inChunks(dealIds, (ids) => prisma.deal.findMany({
          where: { id: { in: ids }, tenantId },
          select: {
            id: true, saleAmount: true, purchaseAmount: true, vehicleValue: true, documentationFee: true, discountAmount: true,
            vehicles: { select: { agreedValue: true } },
            debts: { select: { id: true, type: true, value: true, responsavel: true } },
            services: { select: { id: true, value: true, kind: true, name: true, supplier: true } },
            discountRequests: { select: { status: true, approvedValue: true, requestedValue: true } },
          },
        }))
      : [],
  ])
  const commissionById = new Map(commissions.map((c) => [c.id, commissionRefOf(c)]))
  for (const c of commissionById.values()) if (c.serviceId) serviceIds.push(c.serviceId)
  const services = serviceIds.length
    ? await inChunks(serviceIds, (ids) => prisma.dealService.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true, name: true, supplier: true } }))
    : []
  const debtById = new Map(debts.map((d) => [d.id, d]))
  const kindById = new Map(services.map((s) => [s.id, serviceKindOf(s)]))
  const componentsByDeal = new Map<string, RevenueComponent[]>(deals.map((d) => [d.id, dealRevenueComponents(d as Parameters<typeof dealRevenueComponents>[0])]))

  const ctx: CenterContext = {
    // Débito de documentação assumido pela loja (cortesia) é custo da venda, não do centro de documentação.
    debtType: (id) => {
      const d = debtById.get(id)
      if (!d) return null
      return isDocDebtType(d.type) && !isChargedDocDebt(d) ? 'CORTESIA' : d.type
    },
    serviceKind: (id) => kindById.get(id) ?? null,
    commission: (id) => commissionById.get(id) ?? null,
  }
  const idOfKey = (key: string | null) => (key ? refs.centerIdByKey[key] ?? null : null)

  const out: RawEntry[] = []
  for (const e of raw) {
    const s = e.source ?? ''
    const group = e.groupOverride ?? refs.groupOf(e)
    const code = e.categoryId ? refs.catCode(e.categoryId) : null
    const derive = () => {
      const byCat = !s || !AUTO_SOURCE.test(s) ? centerKeyByCategoryCode(code) : null
      return byCat ?? deriveCenterKey({ source: e.source, type: e.type, commissionCalculationId: e.commissionCalculationId }, group, ctx)
    }

    // ── Custo de serviço vendido → CMV_SERVICOS ──────────────────────────
    if (e.type === 'DESPESA') {
      let costKind: string | null = null
      if (s.startsWith('NEG_SERV_')) costKind = kindById.get(s.slice(9)) ?? 'OUTRO'
      else if (s.startsWith('NEG_GAR_')) costKind = 'GARANTIA'
      else if (s.startsWith('NEG_DEBITO_')) {
        const d = debtById.get(s.slice(11))
        if (d && isChargedDocDebt(d)) costKind = 'DOCUMENTACAO'
      }
      if (costKind) {
        const kind = SERVICE_KIND_BY_KEY[costKind] ?? SERVICE_KIND_BY_KEY.OUTRO
        const categoryId = group === 'CMV_SERVICOS' ? e.categoryId : refs.catIdByCode(kind.costCode) ?? e.categoryId
        out.push({ ...e, categoryId, groupOverride: 'CMV_SERVICOS', centerId: e.costCenterId ?? idOfKey(kind.center) })
        continue
      }
    }

    // ── Recebimento da negociação → rateio ───────────────────────────────
    const comps = split && e.type === 'RECEITA' && e.dealId && isDealReceiptSource(s) ? componentsByDeal.get(e.dealId) : undefined
    const parts = comps ? splitReceipt(e.amount, comps) : []
    if (parts.length > 1 || (parts.length === 1 && parts[0].component.key !== 'VEICULO')) {
      const byKey = (n: number | null | undefined) => new Map((n ? splitReceipt(n, comps!) : []).map((p) => [p.component.key, p.amount]))
      const interest = byKey(e.interestAmount), discount = byKey(e.discountAmount)
      // A sincronização grava VENDAS no recebimento; só um centro trocado à mão vence o rateio.
      const chosen = e.costCenterId && e.costCenterId !== refs.centerIdByKey.VENDAS ? e.costCenterId : null
      for (const p of parts) {
        const c = p.component
        const base: RawEntry = {
          ...e, amount: p.amount, part: c.key,
          interestAmount: interest.get(c.key) ?? null, discountAmount: discount.get(c.key) ?? null,
          centerId: chosen ?? idOfKey(c.center),
        }
        if (c.revenueCode) {
          const categoryId = refs.catIdByCode(c.revenueCode)
          out.push({ ...base, categoryId, groupOverride: revenueGroup(refs, c.revenueCode, categoryId) })
        } else {
          out.push({ ...base, groupOverride: 'REC_VEICULOS' })
        }
      }
      continue
    }
    if (parts.length === 1) {
      out.push({ ...e, part: 'VEICULO', groupOverride: 'REC_VEICULOS', centerId: e.costCenterId ?? idOfKey('VENDAS') })
      continue
    }

    out.push({ ...e, centerId: e.costCenterId ?? idOfKey(derive()) })
  }
  return out
}

/** Filtro de centro dos relatórios: id do centro (escolhido ou derivado) ou 'none'. */
export function matchesCenterFilter(e: RawEntry, filter: string | null | undefined, refs: FinanceRefs): boolean {
  if (!filter) return true
  const known = !!e.centerId && refs.centers.some((c) => c.id === e.centerId)
  if (filter === 'none') return !known
  return e.centerId === filter
}
