// =============================================================================
// fi-receipt-core.ts — F&I do contrato de financiamento (lado do financeiro).
// Funções PURAS (sem banco): validação do que o financeiro grava no pagamento
// FINANCIAMENTO (retorno, ILA, IOF, IRRF, PLUS, agregados), resumo do contrato
// e mapeamento do que o AutoConf traz (ila/irrf/valorRetorno) sem sobrescrever
// o que o financeiro já editou.
//
//   Valor a receber do banco     = valor financiado − agregados de TERCEIRO
//   Receitas da loja no contrato = retorno líquido + PLUS + Σ receita da loja
//   Retorno líquido (automático) = bruto − ILA − IOF − IRRF
// =============================================================================

import { z } from 'zod'

export const FI_ADDON_KINDS = ['SEGURO', 'GARANTIA', 'PROTECAO', 'RASTREADOR', 'DESPACHANTE', 'ACESSORIO', 'OUTRO'] as const
export type FiAddOnKind = (typeof FI_ADDON_KINDS)[number]
export const FI_ADDON_KIND_LABEL: Record<FiAddOnKind, string> = {
  SEGURO: 'Seguro', GARANTIA: 'Garantia', PROTECAO: 'Proteção', RASTREADOR: 'Rastreador',
  DESPACHANTE: 'Despachante', ACESSORIO: 'Acessórios', OUTRO: 'Outro',
}
export const FI_MAX_ADDONS = 20

export type FiBeneficiary = 'LOJA' | 'TERCEIRO'

export interface FiAddOn {
  name: string
  kind: FiAddOnKind
  amount: number
  beneficiary: FiBeneficiary
  storeRevenue?: number | null
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Tipo de agregado normalizado (o catálogo FinanceProduct usa SEGURO|GARANTIA|PROTECAO|RASTREADOR|OUTRO). */
export function normalizeAddOnKind(v: unknown): FiAddOnKind {
  const s = String(v ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return (FI_ADDON_KINDS as readonly string[]).includes(s) ? (s as FiAddOnKind) : 'OUTRO'
}

// ── Validação do que o financeiro grava ─────────────────────────────────────
const money = z.coerce.number({ invalid_type_error: 'Valor inválido.' }).finite().min(0, 'Valores não podem ser negativos.').max(99_999_999, 'Valor muito alto.')
const optMoney = money.nullable().optional()

export const fiAddOnSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do agregado.').max(80),
  kind: z.string().optional().transform((v) => normalizeAddOnKind(v)),
  amount: money,
  beneficiary: z.enum(['LOJA', 'TERCEIRO'], { errorMap: () => ({ message: 'Beneficiário deve ser LOJA ou TERCEIRO.' }) }),
  storeRevenue: optMoney,
})

export const fiPatchSchema = z.object({
  action: z.literal('FI'),
  returnPct: z.coerce.number().finite().min(0).max(20, 'Retorno % acima do permitido.').nullable().optional(),
  returnGrossValue: optMoney,
  ilaValue: optMoney,
  iofValue: optMoney,
  irrfValue: optMoney,
  returnNetValue: z.coerce.number().finite().min(-99_999_999).max(99_999_999).nullable().optional(),
  plusValue: optMoney,
  contractNumber: z.string().trim().max(60).nullable().optional(),
  addOns: z.array(fiAddOnSchema).max(FI_MAX_ADDONS, `Máximo de ${FI_MAX_ADDONS} agregados.`).optional(),
})
export type FiPatchInput = z.infer<typeof fiPatchSchema>

/** Retorno líquido = bruto − ILA − IOF − IRRF (null quando não há bruto). */
export function computeFiNet(gross: unknown, ila?: unknown, iof?: unknown, irrf?: unknown): number | null {
  const g = toNum(gross)
  if (g == null) return null
  return round2(g - (toNum(ila) ?? 0) - (toNum(iof) ?? 0) - (toNum(irrf) ?? 0))
}

/** Converte o payload validado nos dados da coluna (net automático quando não informado). */
export function buildFiUpdate(input: FiPatchInput): {
  returnPct?: number | null
  returnGrossValue: number | null; ilaValue: number | null; iofValue: number | null; irrfValue: number | null
  returnNetValue: number | null; plusValue: number | null; contractNumber: string | null; addOns: FiAddOn[] | null
} {
  const r = (v: number | null | undefined) => (v == null ? null : round2(v))
  const gross = r(input.returnGrossValue)
  const ila = r(input.ilaValue)
  const iof = r(input.iofValue)
  const irrf = r(input.irrfValue)
  const net = input.returnNetValue != null ? round2(input.returnNetValue) : computeFiNet(gross, ila, iof, irrf)
  const addOns = (input.addOns ?? []).map((a) => ({
    name: a.name, kind: a.kind, amount: round2(a.amount), beneficiary: a.beneficiary,
    ...(a.storeRevenue != null ? { storeRevenue: round2(a.storeRevenue) } : {}),
  }))
  return {
    ...(input.returnPct !== undefined ? { returnPct: input.returnPct == null ? null : round2(input.returnPct) } : {}),
    returnGrossValue: gross, ilaValue: ila, iofValue: iof, irrfValue: irrf, returnNetValue: net,
    plusValue: r(input.plusValue),
    contractNumber: input.contractNumber ? input.contractNumber : null,
    addOns: addOns.length ? addOns : null,
  }
}

/** Lê o Json gravado (tolerante a lixo) → lista de agregados válida. */
export function parseAddOns(raw: unknown): FiAddOn[] {
  if (!Array.isArray(raw)) return []
  const out: FiAddOn[] = []
  for (const it of raw.slice(0, FI_MAX_ADDONS)) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const amount = toNum(o.amount)
    if (!name || amount == null || amount < 0) continue
    const sr = toNum(o.storeRevenue)
    out.push({
      name, kind: normalizeAddOnKind(o.kind), amount: round2(amount),
      beneficiary: o.beneficiary === 'TERCEIRO' ? 'TERCEIRO' : 'LOJA',
      ...(sr != null && sr >= 0 ? { storeRevenue: round2(sr) } : {}),
    })
  }
  return out
}

// ── Resumo do contrato ──────────────────────────────────────────────────────
export interface FiSummary {
  addOnsTotal: number
  thirdPartyTotal: number
  storeAddOnsTotal: number
  storeRevenueTotal: number
  /** Valor financiado − agregados de TERCEIRO (o banco paga direto ao terceiro). */
  bankReceivable: number
  /** Retorno líquido + PLUS + Σ receita da loja nos agregados. */
  storeIncome: number
}

export function summarizeFiContract(input: { financedAmount: unknown; returnNetValue?: unknown; plusValue?: unknown; addOns?: FiAddOn[] | null }): FiSummary {
  const addOns = input.addOns ?? []
  const sum = (xs: number[]) => round2(xs.reduce((s, v) => s + v, 0))
  const addOnsTotal = sum(addOns.map((a) => a.amount || 0))
  const thirdPartyTotal = sum(addOns.filter((a) => a.beneficiary === 'TERCEIRO').map((a) => a.amount || 0))
  const storeAddOnsTotal = sum(addOns.filter((a) => a.beneficiary === 'LOJA').map((a) => a.amount || 0))
  const storeRevenueTotal = sum(addOns.map((a) => a.storeRevenue ?? 0))
  const financed = toNum(input.financedAmount) ?? 0
  return {
    addOnsTotal, thirdPartyTotal, storeAddOnsTotal, storeRevenueTotal,
    bankReceivable: round2(financed - thirdPartyTotal),
    storeIncome: round2((toNum(input.returnNetValue) ?? 0) + (toNum(input.plusValue) ?? 0) + storeRevenueTotal),
  }
}

// ── AutoConf → colunas F&I (só preenche o que está vazio) ───────────────────
export interface FiColumns {
  returnGrossValue?: number | null
  ilaValue?: number | null
  iofValue?: number | null
  irrfValue?: number | null
  returnNetValue?: number | null
}

/** ila/irrf/valorRetorno do snapshot do AutoConf → colunas (valores em R$). */
export function fiFromAutoconf(p: { ila?: unknown; irrf?: unknown; valorRetorno?: unknown; iof?: unknown } | null | undefined): FiColumns {
  if (!p) return {}
  const pos = (v: unknown) => { const n = toNum(v); return n != null && n > 0 ? round2(n) : null }
  const gross = pos(p.valorRetorno)
  // O AutoConf manda ILA/IRRF como percentual do retorno (ex.: "5,2"); valores
  // acima de 30 só fazem sentido em R$.
  const asValue = (v: number | null) => (v != null && gross != null && v <= 30 ? round2((gross * v) / 100) : v)
  const ila = asValue(pos(p.ila))
  const irrf = asValue(pos(p.irrf))
  const iof = pos(p.iof)
  const out: FiColumns = {}
  if (gross != null) out.returnGrossValue = gross
  if (ila != null) out.ilaValue = ila
  if (irrf != null) out.irrfValue = irrf
  if (iof != null) out.iofValue = iof
  if (gross != null) out.returnNetValue = computeFiNet(gross, ila, iof, irrf)
  return out
}

/**
 * Mantém só os campos de `incoming` cuja coluna ainda está vazia em `existing`
 * (o que o financeiro editou nunca é sobrescrito). O líquido só é preenchido se
 * o bruto também estava vazio (senão seria calculado sobre outro bruto).
 */
export function fillFiNulls(existing: Partial<Record<keyof FiColumns, unknown>> | null | undefined, incoming: FiColumns): FiColumns {
  const ex = existing ?? {}
  const out: FiColumns = {}
  for (const k of Object.keys(incoming) as Array<keyof FiColumns>) {
    if (incoming[k] == null) continue
    if (ex[k] != null) continue
    if (k === 'returnNetValue' && ex.returnGrossValue != null) continue
    out[k] = incoming[k]
  }
  return out
}

/** Remove de uma observação os números de F&I que agora têm coluna própria. */
export function stripFiFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return notes ?? null
  const kept = notes.split(' | ').filter((part) => !/^(ILA|IRRF|Retorno bruto)=/i.test(part.trim()))
  return kept.join(' | ') || null
}

// ── Reimportação legada (apaga e recria pagamentos) ─────────────────────────
/** Colunas de F&I que o financeiro edita e que precisam sobreviver à reimportação. */
export const FI_PRESERVED_KEYS = ['returnPct', 'returnGrossValue', 'ilaValue', 'iofValue', 'irrfValue', 'returnNetValue', 'plusValue', 'addOns', 'contractNumber'] as const

/**
 * Casa os financiamentos importados com os já gravados: primeiro mesmo valor
 * (±1 centavo) e banco, depois mesmo valor, depois a ordem. Devolve, para cada
 * item de `incoming`, o índice em `existing` (ou -1). Não-financiamento → -1.
 */
export function matchFinancings(
  incoming: Array<{ type?: string | null; value?: unknown; bank?: string | null }>,
  existing: Array<{ value?: unknown; bank?: string | null }>,
): number[] {
  const used = new Set<number>()
  const out = incoming.map(() => -1)
  const same = (a: unknown, b: unknown) => Math.abs((toNum(a) ?? 0) - (toNum(b) ?? 0)) < 0.011
  const norm = (b: string | null | undefined) => String(b ?? '').trim().toUpperCase()
  const pass = (ok: (i: number, j: number) => boolean) => {
    incoming.forEach((p, i) => {
      if (p.type !== 'FINANCIAMENTO' || out[i] !== -1) return
      const j = existing.findIndex((e, k) => !used.has(k) && ok(i, k))
      if (j >= 0) { out[i] = j; used.add(j) }
    })
  }
  pass((i, k) => same(incoming[i].value, existing[k].value) && norm(incoming[i].bank) === norm(existing[k].bank))
  pass((i, k) => same(incoming[i].value, existing[k].value))
  pass(() => true)
  return out
}
