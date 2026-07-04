// =============================================================================
// commission/period-bonuses.ts — BÔNUS DE PERÍODO (agregados por mês/unidade):
//   • Produção da loja (R$/carro da unidade por colaborador)
//   • Meta da loja (fixo por cargo quando a unidade bate o alvo)
//   • Bônus das 3 dezenas (quando o vendedor fecha as 3 dezenas)
// Idempotente: apaga os bônus de período PREVISTO da unidade/mês (marcados com
// ruleDetails.periodBonus) e recria a partir da contagem atual. PAGO/APROVADO
// ficam intactos. Escopo estrito ao tenant/unidade.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { getBonusPeriodoConfig } from '@/lib/finance/bonus-periodo-config'

const MAIN_SCOPE = 'SELLER_MAIN_COMMISSION'

export interface PeriodBonusResult {
  unitId: string
  period: string
  unitCars: number
  created: number
  producao: number
  meta: number
  dezenaCombo: number
}

interface PendingBonus {
  sellerId?: string | null
  managerId?: string | null
  scope: 'STORE_PRODUCTION' | 'STORE_GOAL' | 'DECEND_COMBO'
  kind: 'PRODUCAO' | 'META' | 'DEZENA_COMBO'
  value: number
  description: string
}

/** Recalcula (idempotente) os bônus de período de UMA unidade num mês. */
export async function recomputePeriodBonusesForUnit(opts: {
  tenantId: string | null
  unitId: string
  period: string
  dryRun?: boolean
}): Promise<PeriodBonusResult> {
  const { tenantId, unitId, period } = opts
  const dryRun = opts.dryRun === true
  const cfg = await getBonusPeriodoConfig(tenantId ?? '')

  // Contagem de carros da unidade no mês = principais de VENDA (SELLER_MAIN),
  // não cancelados. Cada lançamento principal = 1 carro vendido/trocado.
  const mainRows = await prisma.commissionCalculation.findMany({
    where: {
      tenantId, unitId, period, ruleType: 'VENDA', status: { not: 'CANCELADO' },
      ruleDetails: { path: ['commissionScope'], equals: MAIN_SCOPE } as never,
    },
    select: { sellerId: true },
  }).catch(() => [] as Array<{ sellerId: string | null }>)
  const unitCars = mainRows.length
  const sellerIds = [...new Set(mainRows.map((r) => r.sellerId).filter((v): v is string => !!v))]

  const pending: PendingBonus[] = []

  // ── Produção da loja: R$/carro da unidade, por colaborador ───────────────
  if (cfg.producaoLoja.active && unitCars > 0) {
    for (const r of cfg.producaoLoja.rates) {
      const value = Math.round(unitCars * r.rate * 100) / 100
      if (value <= 0) continue
      const [pfx, id] = r.key.split(':')
      if (!id) continue
      pending.push({
        sellerId: pfx === 's' ? id : null,
        managerId: pfx === 'm' ? id : null,
        scope: 'STORE_PRODUCTION', kind: 'PRODUCAO', value,
        description: `Produção da loja — ${unitCars} carros × R$ ${r.rate} — ${r.nome || 'colaborador'}`,
      })
    }
  }

  // ── Meta da loja: alvo de vendas da unidade atingido → fixo por cargo ─────
  if (cfg.metaLoja.active && cfg.metaLoja.targetUnitSales > 0 && unitCars >= cfg.metaLoja.targetUnitSales) {
    if (cfg.metaLoja.vendedor > 0) {
      for (const sid of sellerIds) {
        pending.push({ sellerId: sid, scope: 'STORE_GOAL', kind: 'META', value: cfg.metaLoja.vendedor, description: `Meta da loja atingida (${unitCars}/${cfg.metaLoja.targetUnitSales}) — vendedor` })
      }
    }
    if (cfg.metaLoja.gerente > 0) {
      const managers = await prisma.manager.findMany({ where: { unitId }, select: { id: true } }).catch(() => [])
      for (const m of managers) {
        pending.push({ managerId: m.id, scope: 'STORE_GOAL', kind: 'META', value: cfg.metaLoja.gerente, description: `Meta da loja atingida (${unitCars}/${cfg.metaLoja.targetUnitSales}) — gerente` })
      }
    }
  }

  // ── Bônus das 3 dezenas: vendedor que fechou as 3 dezenas do mês ─────────
  if (cfg.dezenaCombo.active && cfg.dezenaCombo.value > 0) {
    for (const sid of sellerIds) {
      const dez = await prisma.commissionCalculation.findMany({
        where: { tenantId, unitId, period, sellerId: sid, ruleType: 'BONUS_DEZENA', status: { not: 'CANCELADO' } },
        select: { ruleDetails: true },
      }).catch(() => [] as Array<{ ruleDetails: unknown }>)
      const codes = new Set(dez.map((d) => (d.ruleDetails as { decend?: string } | null)?.decend).filter(Boolean))
      if (codes.size >= 3) {
        pending.push({ sellerId: sid, scope: 'DECEND_COMBO', kind: 'DEZENA_COMBO', value: cfg.dezenaCombo.value, description: `Bônus das 3 dezenas fechadas — ${period}` })
      }
    }
  }

  const summary: PeriodBonusResult = {
    unitId, period, unitCars,
    created: pending.length,
    producao: pending.filter((p) => p.kind === 'PRODUCAO').length,
    meta: pending.filter((p) => p.kind === 'META').length,
    dezenaCombo: pending.filter((p) => p.kind === 'DEZENA_COMBO').length,
  }
  if (dryRun) return summary

  // Idempotência: apaga os bônus de período PREVISTO da unidade/mês e recria.
  await prisma.commissionCalculation.deleteMany({
    where: {
      tenantId, unitId, period, status: 'PREVISTO', ruleType: 'EXCECAO',
      ruleDetails: { path: ['periodBonus'], equals: true } as never,
    },
  }).catch(() => {})

  for (const p of pending) {
    await prisma.commissionCalculation.create({
      data: {
        tenantId, unitId, period, sellerId: p.sellerId ?? null, managerId: p.managerId ?? null,
        ruleType: 'EXCECAO', description: p.description,
        baseValue: 0, commissionValue: p.value, status: 'PREVISTO',
        ruleDetails: { commissionScope: p.scope, periodBonus: true, bonusKind: p.kind } as never,
      },
    }).catch(() => {})
  }

  return summary
}

/** Recalcula os bônus de período de VÁRIAS unidades (distintas) num mês. */
export async function recomputePeriodBonusesForUnits(tenantId: string | null, unitIds: string[], period: string): Promise<PeriodBonusResult[]> {
  const out: PeriodBonusResult[] = []
  for (const unitId of [...new Set(unitIds.filter(Boolean))]) {
    out.push(await recomputePeriodBonusesForUnit({ tenantId, unitId, period }))
  }
  return out
}
