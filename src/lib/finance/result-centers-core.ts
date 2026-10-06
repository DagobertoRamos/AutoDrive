// =============================================================================
// Centros de resultado — PURO (testado).
// Centro de RESULTADO tem receita e custo próprios (documentação, funilaria,
// F&I…) e mostra lucro/prejuízo; centro de CUSTO só acumula despesa
// (marketing, administrativo). Os lançamentos automáticos são classificados
// pela origem; lançamento manual com centro escolhido sempre vence.
// =============================================================================

import { baseSource } from './settlement-core'

export type CenterKind = 'RESULTADO' | 'CUSTO'

export interface ResultCenterDef { key: string; name: string; kind: CenterKind }

export const RESULT_CENTERS: ResultCenterDef[] = [
  { key: 'VENDAS',         name: 'Vendas de veículos',            kind: 'RESULTADO' },
  { key: 'DOCUMENTACAO',   name: 'Documentação / Despachante',    kind: 'RESULTADO' },
  { key: 'FUNILARIA',      name: 'Funilaria e pintura',           kind: 'RESULTADO' },
  { key: 'ESTETICA',       name: 'Estética',                      kind: 'RESULTADO' },
  { key: 'ACESSORIOS',     name: 'Acessórios',                    kind: 'RESULTADO' },
  { key: 'GARANTIAS',      name: 'Garantias',                     kind: 'RESULTADO' },
  { key: 'FI',             name: 'F&I (financiamento e seguros)', kind: 'RESULTADO' },
  { key: 'PREPARACAO',     name: 'Preparação / Oficina',          kind: 'CUSTO' },
  { key: 'MARKETING',      name: 'Marketing',                     kind: 'CUSTO' },
  { key: 'ADMINISTRATIVO', name: 'Administrativo',                kind: 'CUSTO' },
]
export const RESULT_CENTER_BY_KEY: Record<string, ResultCenterDef> = Object.fromEntries(RESULT_CENTERS.map((c) => [c.key, c]))

/** Centros padrão antigos (criados antes dos centros de resultado) → chave. */
export function legacyCenterKey(name: string): string | null {
  const n = fold(name)
  if (n === 'vendas') return 'VENDAS'
  if (n.startsWith('preparacao')) return 'PREPARACAO'
  if (n === 'f&i' || n.startsWith('f&i')) return 'FI'
  if (n === 'marketing') return 'MARKETING'
  if (n === 'administrativo') return 'ADMINISTRATIVO'
  return null
}

// ── Linhas de serviço vendidas ao cliente ────────────────────────────────────
export interface ServiceKindDef { key: string; label: string; center: string; revenueCode: string; costCode: string }

/** revenueCode/costCode = códigos do plano de contas padrão (ver dre-core DEFAULT_CHART). */
export const SERVICE_KINDS: ServiceKindDef[] = [
  { key: 'DOCUMENTACAO', label: 'Documentação / despachante', center: 'DOCUMENTACAO', revenueCode: '4.2', costCode: '21.1' },
  { key: 'FUNILARIA',    label: 'Funilaria e pintura',        center: 'FUNILARIA',    revenueCode: '4.4', costCode: '21.2' },
  { key: 'ESTETICA',     label: 'Estética',                   center: 'ESTETICA',     revenueCode: '4.5', costCode: '21.3' },
  { key: 'ACESSORIO',    label: 'Acessórios',                 center: 'ACESSORIOS',   revenueCode: '4.3', costCode: '21.4' },
  { key: 'GARANTIA',     label: 'Garantia',                   center: 'GARANTIAS',    revenueCode: '4.1', costCode: '21.5' },
  { key: 'SEGURO',       label: 'Seguro',                     center: 'FI',           revenueCode: '2.2', costCode: '21.6' },
  { key: 'OUTRO',        label: 'Outros serviços',            center: 'VENDAS',       revenueCode: '4.6', costCode: '21.6' },
]
export const SERVICE_KIND_BY_KEY: Record<string, ServiceKindDef> = Object.fromEntries(SERVICE_KINDS.map((k) => [k.key, k]))

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Tipo do serviço pelo nome (serviços antigos sem tipo). */
export function guessServiceKind(name: string | null | undefined, supplier?: string | null): string {
  const n = fold(`${name ?? ''} ${supplier ?? ''}`)
  if (/garantia|gestauto/.test(n)) return 'GARANTIA'
  if (/seguro|prestamista/.test(n)) return 'SEGURO'
  if (/documenta|despachante|transferenc|emplaca|vistoria|laudo|licencia/.test(n)) return 'DOCUMENTACAO'
  if (/funilaria|pintura|martelinho|lanternagem|repintura|para-?choque/.test(n)) return 'FUNILARIA'
  if (/polimento|vitrifica|higieniza|lavagem|estetica|insulfilm|pelicula|cristaliza|oxi-?sanit/.test(n)) return 'ESTETICA'
  if (/acessori|tapete|som\b|alarme|rastreador|engate|sensor|camera|multimidia|calha|protetor/.test(n)) return 'ACESSORIO'
  return 'OUTRO'
}

export const serviceKindOf = (s: { kind?: string | null; name?: string | null; supplier?: string | null }) =>
  s.kind && SERVICE_KIND_BY_KEY[s.kind] ? s.kind : guessServiceKind(s.name, s.supplier)

// ── Classificação dos lançamentos no centro ─────────────────────────────────
const DOC_DEBT_TYPES = new Set(['DOCUMENTACAO', 'DESPACHANTE', 'TRANSFERENCIA', 'LICENCIAMENTO', 'VISTORIA', 'LAUDO'])

export interface CenterContext {
  /** Tipo do débito da negociação (NEG_DEBITO_<id>). */
  debtType?: (debtId: string) => string | null | undefined
  /** Tipo de serviço (NEG_SERV_<id>). */
  serviceKind?: (serviceId: string) => string | null | undefined
  /** Comissão: tipo da regra e serviço de origem. */
  commission?: (commissionCalculationId: string) => { ruleType?: string | null; serviceId?: string | null } | null | undefined
}

/**
 * Centro (chave) de um lançamento sem centro escolhido: pela origem e, por
 * último, pelo grupo da DRE.
 */
export function deriveCenterKey(
  e: { source?: string | null; type: 'RECEITA' | 'DESPESA'; commissionCalculationId?: string | null },
  dreGroup: string,
  ctx: CenterContext = {},
): string {
  const s = baseSource(e.source) ?? ''
  if (s.startsWith('NEG_SERV_')) return SERVICE_KIND_BY_KEY[ctx.serviceKind?.(s.slice(9)) ?? '']?.center ?? 'VENDAS'
  if (s.startsWith('NEG_GAR_')) return 'GARANTIAS'
  if (s.startsWith('NEG_RETORNO_') || s.startsWith('NEG_PLUS_') || s.startsWith('NEG_AGREG_')) return 'FI'
  if (s.startsWith('NEG_DEBITO_')) return DOC_DEBT_TYPES.has(String(ctx.debtType?.(s.slice(11)) ?? '').toUpperCase()) ? 'DOCUMENTACAO' : 'VENDAS'
  if (e.commissionCalculationId || s === 'COMISSAO' || s === 'RETORNO' || s === 'GARANTIA') {
    const c = e.commissionCalculationId ? ctx.commission?.(e.commissionCalculationId) : null
    const rt = String(c?.ruleType ?? s).toUpperCase()
    if (rt === 'RETORNO') return 'FI'
    if (rt === 'GARANTIA') return 'GARANTIAS'
    if (rt === 'DOCUMENTO' || rt === 'DOCUMENTACAO') return 'DOCUMENTACAO'
    if (rt === 'SERVICO' && c?.serviceId) return SERVICE_KIND_BY_KEY[ctx.serviceKind?.(c.serviceId) ?? '']?.center ?? 'VENDAS'
    return 'VENDAS'
  }
  if (s.startsWith('VEICULO_')) {
    const cat = s.slice(8)
    if (cat === 'COMPRA_VEICULO' || cat === 'REPASSE') return 'VENDAS'
    if (cat === 'RETORNO') return 'FI'
    if (cat === 'DOCUMENTACAO' || cat === 'DEBITO' || cat === 'MULTA' || cat === 'IMPOSTO') return 'VENDAS'
    return e.type === 'RECEITA' ? 'VENDAS' : 'PREPARACAO'
  }
  switch (dreGroup) {
    case 'REC_FI': return 'FI'
    case 'DESP_MARKETING': return 'MARKETING'
    case 'CMV_PREPARACAO': return 'PREPARACAO'
    case 'REC_VEICULOS': case 'CMV_AQUISICAO': case 'CMV_DOCUMENTACAO': case 'DESP_COMISSOES': case 'REC_INTERMEDIACAO': return 'VENDAS'
    default: return 'ADMINISTRATIVO'
  }
}

/**
 * Centro pela categoria do plano padrão (lançamento manual sem centro):
 * 4.x serviço cobrado / 21.x custo do serviço → centro do tipo; 2.x → F&I.
 * null = a categoria não define centro (segue deriveCenterKey).
 */
export function centerKeyByCategoryCode(code: string | null | undefined): string | null {
  const c = String(code ?? '').trim()
  if (!c) return null
  if (c === '2' || c.startsWith('2.')) return 'FI'
  if (c === '15' || c.startsWith('15.')) return 'MARKETING'
  if (c === '10' || c.startsWith('10.')) return 'PREPARACAO'
  for (const k of SERVICE_KINDS) {
    if (k.revenueCode.startsWith('2.')) continue // seguro: receita é F&I (acima)
    if (c === k.revenueCode || c.startsWith(`${k.revenueCode}.`)) return k.center
  }
  for (const k of SERVICE_KINDS) {
    if (k.key === 'OUTRO' || k.key === 'SEGURO') continue // 21.6 é compartilhado
    if (c === k.costCode || c.startsWith(`${k.costCode}.`)) return k.center
  }
  return null
}

// =============================================================================
// Rateio do recebimento da negociação (DRE e centros; o fluxo de caixa não usa).
// O cliente paga UM valor (sinal, financiamento, troca…), mas ele remunera
// várias linhas: o carro, a documentação cobrada e cada serviço vendido. Cada
// recebimento é dividido na proporção dessas linhas, ao centavo.
//
// Composição — espelha calculateNegotiationFinancialSummary/dealToFinancialInput
// (negotiation-service), a conta do saldo que trava a finalização:
//   veículo (saleAmount → purchaseAmount → vehicleValue → 1º agreedValue)
//   + TODOS os débitos + serviços (Σ DealService.value; servicesAmount não entra)
//   + taxa de documentação (documentationFee) − descontos (flat + pedidos APROVADO).
//   Garantias de WarrantySale NÃO entram no saldo (o Deal não tem `warranties`),
//   então não entram no rateio; garantia importada como DealService entra como serviço.
// Destino de cada parte:
//   documentação (4.2 · DOCUMENTACAO) = documentationFee + débitos de documentação
//     cobrados do cliente (responsável COMPRADOR/CLIENTE);
//   serviço (receita do tipo · centro do tipo) = DealService.value;
//   veículo (REC_VEICULOS · VENDAS) = veículo − descontos + demais débitos.
// =============================================================================

export const isDocDebtType = (type: string | null | undefined) => DOC_DEBT_TYPES.has(String(type ?? '').toUpperCase())
export const isDebtChargedToCustomer = (responsavel: string | null | undefined) => ['COMPRADOR', 'CLIENTE'].includes(String(responsavel ?? '').toUpperCase())
/** Débito de documentação cobrado do cliente → receita/custo do centro DOCUMENTACAO (CMV_SERVICOS). */
export const isChargedDocDebt = (d: { type: string | null | undefined; responsavel?: string | null }) => isDocDebtType(d.type) && isDebtChargedToCustomer(d.responsavel)

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const c2 = (n: number) => Math.round(n * 100) / 100

export interface DealRevenueInput {
  saleAmount?: unknown
  purchaseAmount?: unknown
  vehicleValue?: unknown
  documentationFee?: unknown
  discountAmount?: unknown
  vehicles?: { agreedValue?: unknown }[]
  debts?: { id: string; type: string; value: unknown; responsavel?: string | null }[]
  services?: { id: string; value: unknown; kind?: string | null; name?: string | null; supplier?: string | null }[]
  discountRequests?: { status: string; approvedValue?: unknown; requestedValue?: unknown }[]
  /** Garantias vendidas (cadastro de garantias): receita da área Garantias pelo preço de venda. */
  warrantyPaidBy?: string | null
  warrantySales?: { id: string; finalPrice: unknown; status: string }[]
}

export interface RevenueComponent {
  /** VEICULO | DOCUMENTACAO | SERV_<dealServiceId> */
  key: string
  label: string
  /** Centro (chave) da receita. */
  center: string
  /** Código da categoria de receita (null = venda de veículos, mantém a categoria do recebimento). */
  revenueCode: string | null
  amount: number
  serviceId?: string
  serviceKind?: string
}

const firstSet = (...v: unknown[]) => v.find((x) => x !== null && x !== undefined)

/** Linhas de receita da negociação (valores > 0; zeradas não entram). */
export function dealRevenueComponents(d: DealRevenueInput): RevenueComponent[] {
  const firstAgreed = (d.vehicles ?? []).find((v) => num(v.agreedValue) > 0)?.agreedValue
  const vehicle = num(firstSet(d.saleAmount, d.purchaseAmount, d.vehicleValue, firstAgreed))
  const discount = num(d.discountAmount) + (d.discountRequests ?? [])
    .filter((r) => r.status === 'APROVADO').reduce((s, r) => s + num(r.approvedValue ?? r.requestedValue), 0)
  let doc = num(d.documentationFee), otherDebts = 0
  for (const x of d.debts ?? []) {
    if (isChargedDocDebt(x)) doc += num(x.value)
    else otherDebts += num(x.value)
  }
  const out: RevenueComponent[] = []
  const veh = vehicle - discount + otherDebts
  if (veh > 0) out.push({ key: 'VEICULO', label: 'Venda do veículo', center: 'VENDAS', revenueCode: null, amount: c2(veh) })
  if (doc > 0) out.push({ key: 'DOCUMENTACAO', label: 'Documentação cobrada', center: 'DOCUMENTACAO', revenueCode: SERVICE_KIND_BY_KEY.DOCUMENTACAO.revenueCode, amount: c2(doc), serviceKind: 'DOCUMENTACAO' })
  // dealToFinancialInput não passa servicesAmount: só os DealService contam no saldo.
  for (const s of (d.services ?? []).filter((x) => num(x.value) > 0)) {
    const kind = SERVICE_KIND_BY_KEY[serviceKindOf(s)]
    out.push({ key: `SERV_${s.id}`, label: s.name || kind.label, center: kind.center, revenueCode: kind.revenueCode, amount: c2(num(s.value)), serviceId: s.id, serviceKind: kind.key })
  }
  // Garantia vendida ao cliente (cortesia da loja não é receita).
  if (String(d.warrantyPaidBy ?? '').toUpperCase() !== 'LOJA') {
    for (const w of (d.warrantySales ?? []).filter((x) => x.status === 'ATIVA' && num(x.finalPrice) > 0)) {
      out.push({ key: `GAR_${w.id}`, label: 'Garantia', center: 'GARANTIAS', revenueCode: SERVICE_KIND_BY_KEY.GARANTIA.revenueCode, amount: c2(num(w.finalPrice)), serviceKind: 'GARANTIA' })
    }
  }
  return out
}

/**
 * Divide um recebimento na proporção das linhas, ao centavo: cada parte é
 * arredondada e a sobra vai para a maior linha (a soma bate exatamente).
 * Sem linhas (ou total ≤ 0) → [] (o chamador mantém o recebimento inteiro).
 */
export function splitReceipt<T extends { amount: number }>(amount: number, components: T[]): { component: T; amount: number }[] {
  const comps = components.filter((c) => c.amount > 0)
  const total = comps.reduce((s, c) => s + c.amount, 0)
  if (!comps.length || total <= 0) return []
  const cents = Math.round(amount * 100)
  const parts = comps.map((c) => ({ component: c, cents: Math.round((cents * c.amount) / total) }))
  const diff = cents - parts.reduce((s, p) => s + p.cents, 0)
  if (diff) {
    let big = 0
    for (let i = 1; i < parts.length; i++) if (parts[i].component.amount > parts[big].component.amount) big = i
    parts[big].cents += diff
  }
  return parts.map((p) => ({ component: p.component, amount: p.cents / 100 }))
}

// ── Receitas de F&I por tipo ────────────────────────────────────────────────
export const FI_REVENUE_TYPES = [
  { key: 'RETORNO', label: 'Retorno líquido' },
  { key: 'PLUS', label: 'PLUS por contrato' },
  { key: 'AGREGADO', label: 'Agregados do financiamento' },
  { key: 'SEGURO', label: 'Seguros' },
  { key: 'BONIFICACAO', label: 'Bonificação de bancos' },
  { key: 'ACORDO', label: 'Acordos comerciais' },
  { key: 'OUTRO', label: 'Outras receitas de F&I' },
] as const
export type FiRevenueType = (typeof FI_REVENUE_TYPES)[number]['key']

/** Tipo da receita de F&I: pela origem automática e, nos manuais, pela categoria 2.x. */
export function fiRevenueType(source: string | null | undefined, categoryCode: string | null | undefined, serviceKind?: string | null): FiRevenueType {
  const s = baseSource(source) ?? ''
  if (s.startsWith('NEG_RETORNO_') || s === 'VEICULO_RETORNO') return 'RETORNO'
  if (s.startsWith('NEG_PLUS_')) return 'PLUS'
  if (s.startsWith('NEG_AGREG_')) return 'AGREGADO'
  if (serviceKind === 'SEGURO') return 'SEGURO'
  const c = String(categoryCode ?? '')
  const top = c.split('.').slice(0, 2).join('.')
  if (top === '2.1') return 'RETORNO'
  if (top === '2.2') return 'SEGURO'
  if (top === '2.3') return 'BONIFICACAO'
  if (top === '2.4') return 'ACORDO'
  if (top === '2.5') return 'PLUS'
  return 'OUTRO'
}

// ── Lucro de serviço e agregação por centro ─────────────────────────────────
/** Lucro de um serviço vendido: cobrado − custo real − comissões. */
export function serviceProfit(i: { charged: number; cost: number; commissions: number }) {
  const charged = c2(i.charged), cost = c2(i.cost), commissions = c2(i.commissions)
  const profit = c2(charged - cost - commissions)
  return { charged, cost, commissions, profit, margin: charged > 0 ? c2((profit / charged) * 100) : null }
}

export interface ServiceLineRow { kind: string; charged: number; cost: number; commissions: number }

/** Soma as linhas por tipo de serviço (na ordem de SERVICE_KINDS). */
export function aggregateServiceLines(rows: ServiceLineRow[]) {
  const acc = new Map<string, { charged: number; cost: number; commissions: number; count: number }>()
  for (const r of rows) {
    const a = acc.get(r.kind) ?? { charged: 0, cost: 0, commissions: 0, count: 0 }
    a.charged += r.charged
    a.cost += r.cost
    a.commissions += r.commissions
    a.count++
    acc.set(r.kind, a)
  }
  return SERVICE_KINDS.filter((k) => acc.has(k.key)).map((k) => {
    const a = acc.get(k.key)!
    return { kind: k.key, label: k.label, center: k.center, count: a.count, ...serviceProfit(a) }
  })
}

export interface CenterMeta { id: string; name: string; kind: CenterKind; key: string | null }
export interface CenterEntry { type: 'RECEITA' | 'DESPESA'; amount: number; centerId: string | null }

/**
 * Receitas, custos e resultado por centro. Centros de RESULTADO primeiro, depois
 * os de CUSTO (ordem de RESULT_CENTERS; centros próprios da loja por nome) e
 * "Sem centro" por último. Centro sem movimento só aparece se for um dos padrão.
 */
export function aggregateByCenter(entries: CenterEntry[], centers: CenterMeta[]) {
  const known = new Set(centers.map((c) => c.id))
  const acc = new Map<string, { receitas: number; despesas: number; count: number }>()
  for (const e of entries) {
    const k = e.centerId && known.has(e.centerId) ? e.centerId : '' // centro removido → "Sem centro"
    const a = acc.get(k) ?? { receitas: 0, despesas: 0, count: 0 }
    if (e.type === 'RECEITA') a.receitas += e.amount
    else a.despesas += e.amount
    a.count++
    acc.set(k, a)
  }
  const order = (c: CenterMeta) => {
    const i = c.key ? RESULT_CENTERS.findIndex((d) => d.key === c.key) : -1
    return i >= 0 ? i : 100
  }
  const row = (id: string | null, name: string, kind: CenterKind | null, key: string | null) => {
    const a = acc.get(id ?? '') ?? { receitas: 0, despesas: 0, count: 0 }
    const resultado = c2(a.receitas - a.despesas)
    return { id, key, name, kind, receitas: c2(a.receitas), despesas: c2(a.despesas), resultado, margem: a.receitas > 0 ? c2((resultado / a.receitas) * 100) : null, count: a.count }
  }
  const rows = [...centers]
    .filter((c) => acc.has(c.id) || (c.key && RESULT_CENTER_BY_KEY[c.key]))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'RESULTADO' ? -1 : 1) || order(a) - order(b) || a.name.localeCompare(b.name, 'pt-BR'))
    .map((c) => row(c.id, c.name, c.kind, c.key))
  if (acc.has('')) rows.push(row(null, 'Sem centro', null, null))
  const receitas = c2(rows.reduce((s, r) => s + r.receitas, 0)), despesas = c2(rows.reduce((s, r) => s + r.despesas, 0))
  const resultado = c2(receitas - despesas)
  return { rows, totals: { receitas, despesas, resultado, margem: receitas > 0 ? c2((resultado / receitas) * 100) : null } }
}
