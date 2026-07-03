// =============================================================================
// commission/retroactive.ts — FAIXA RETROATIVA POR PERÍODO (Partes 1 e 6).
//
// Regra comercial: a comissão de venda muda conforme a META/FAIXA batida e o
// novo valor vale para TODOS os carros do período — não só os próximos.
//   Ex.: vendedor com 9 vendas → todos os 9 pagam a faixa "6–9".
//        vendeu o 10º          → todos os 10 passam a pagar a faixa "10–14".
//
// Este serviço reprecifica todos os lançamentos SELLER_MAIN_COMMISSION do
// vendedor no período para a faixa correspondente à contagem ATUAL de carros.
// - Conta = todos os lançamentos principais NÃO cancelados (carros do período).
// - Reprecifica só os PREVISTO (PAGO/APROVADO/AJUSTADO são preservados).
// - Não recalcula "passado" ao mudar regra: só é chamado ao aprovar/importar
//   uma venda ou ao cancelar uma; a mudança de regra em si não dispara (Parte 15).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { findCommissionRule, computeCommissionValue } from '@/lib/commission-matcher'

const MAIN_SCOPE = 'SELLER_MAIN_COMMISSION'

function toNum(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

function scopeOf(ruleDetails: unknown): string | null {
  if (ruleDetails && typeof ruleDetails === 'object' && !Array.isArray(ruleDetails)) {
    const s = (ruleDetails as Record<string, unknown>).commissionScope
    return typeof s === 'string' ? s : null
  }
  return null
}

export interface RetroChange {
  id: string
  oldValue: number
  newValue: number
  status: string
}

export interface RetroResult {
  sellerId: string
  period: string
  count: number
  tierRuleId: string | null
  repriced: number
  /** Lançamentos que mudariam/mudaram de valor (antes → depois). */
  changes: RetroChange[]
}

/**
 * Reprecifica os SELLER_MAIN_COMMISSION do vendedor no período para a faixa da
 * contagem atual de carros. Idempotente (não altera o que já está no valor
 * certo). Nunca toca em PAGO/APROVADO/AJUSTADO/CANCELADO.
 *
 * `dryRun`: quando true, calcula o que MUDARIA (retorna `changes`) sem gravar —
 * usado pela prévia do recálculo manual autorizado (Parte 15).
 */
export async function recalculateSellerMainForPeriod(opts: {
  tenantId: string | null
  sellerId: string
  period: string // yyyy-MM
  date?: Date
  dryRun?: boolean
}): Promise<RetroResult> {
  const { tenantId, sellerId, period } = opts
  const date = opts.date ?? new Date()
  const dryRun = opts.dryRun === true

  // 1. Lançamentos principais do vendedor no período (não cancelados).
  const rows = await prisma.commissionCalculation.findMany({
    where: { tenantId, sellerId, period, ruleType: 'VENDA', status: { not: 'CANCELADO' } },
    select: { id: true, baseValue: true, commissionValue: true, status: true, ruleDetails: true },
  }).catch(() => [] as Array<{ id: string; baseValue: unknown; commissionValue: unknown; status: string; ruleDetails: unknown }>)

  const main = rows.filter((r) => scopeOf(r.ruleDetails) === MAIN_SCOPE)
  // Carros do período = todos os principais não cancelados (inclui PAGO/APROVADO).
  const count = main.length
  if (count === 0) return { sellerId, period, count: 0, tierRuleId: null, repriced: 0, changes: [] }

  // 2. Dados do vendedor (posição/cargo/unidade) para casar a regra.
  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: { positionId: true, unitId: true, user: { select: { role: true } } },
  }).catch(() => null)
  const employee = { kind: 'SELLER' as const, id: sellerId, positionId: seller?.positionId ?? null, role: seller?.user?.role ?? null }
  const unitId = seller?.unitId ?? null

  // 3. Reprecifica TODAS as principais PREVISTAS para a faixa da contagem ATUAL.
  // IMPORTANTE: casa a regra POR LANÇAMENTO passando o `baseValue` do carro — assim
  // regras com teto/piso de valor (ex.: "venda acima de 100 mil" = % ) só se aplicam
  // ao carro cujo valor entra na faixa; os demais pegam a faixa por quantidade.
  let repriced = 0
  let tierRuleId: string | null = null
  const changes: RetroChange[] = []
  for (const r of main) {
    if (r.status !== 'PREVISTO') continue // PAGO/APROVADO/AJUSTADO preservados
    const base = toNum(r.baseValue)
    const matched = await findCommissionRule({
      tenantId, ruleType: 'VENDA', commissionKind: 'REGULAR',
      employee, unitId, quantityInPeriod: count, baseValue: base, date,
    })
    if (!matched) continue
    if (!tierRuleId) tierRuleId = matched.rule.id
    const oldValue = toNum(r.commissionValue)
    const newValue = computeCommissionValue(matched.rule, base)
    if (Math.abs(newValue - oldValue) < 0.005) continue // já está certo
    changes.push({ id: r.id, oldValue, newValue, status: r.status })
    if (!dryRun) {
      const rd = (r.ruleDetails && typeof r.ruleDetails === 'object' && !Array.isArray(r.ruleDetails))
        ? { ...(r.ruleDetails as Record<string, unknown>) }
        : {}
      await prisma.commissionCalculation.update({
        where: { id: r.id },
        data: {
          commissionValue: newValue,
          rateApplied: matched.rule.percentage != null ? matched.rule.percentage : null,
          ruleDetails: {
            ...rd,
            retroTierRuleId: matched.rule.id,
            retroTierMatchedBy: matched.matchedBy,
            quantitySnapshot: count,
            retroAt: date.toISOString(),
          } as never,
        },
      }).catch(() => {})
    }
    repriced++
  }

  return { sellerId, period, count, tierRuleId, repriced, changes }
}

/** Reprecifica os períodos afetados por um conjunto de (sellerId, period). */
export async function recalculateSellersMainForPeriods(
  tenantId: string | null,
  pairs: Array<{ sellerId: string; period: string }>,
  date?: Date,
): Promise<RetroResult[]> {
  const seen = new Set<string>()
  const out: RetroResult[] = []
  for (const p of pairs) {
    const key = `${p.sellerId}:${p.period}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(await recalculateSellerMainForPeriod({ tenantId, sellerId: p.sellerId, period: p.period, date }))
  }
  return out
}
