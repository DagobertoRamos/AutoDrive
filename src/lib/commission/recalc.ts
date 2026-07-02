// =============================================================================
// commission/recalc.ts — RECÁLCULO MANUAL AUTORIZADO por período (Parte 15).
//
// Ação sancionada para "recalcular o passado": reprecifica os lançamentos
// principais (SELLER_MAIN_COMMISSION) de TODOS os vendedores de um período
// (opcionalmente de uma unidade ou de um vendedor) para a faixa correta da
// contagem do período. Sempre com PRÉVIA (dryRun) antes de aplicar.
//
// Garantias herdadas do motor retroativo:
//   • Só reprecifica PREVISTO — PAGO/APROVADO/AJUSTADO ficam intactos.
//   • Idempotente — rodar de novo sem mudanças não altera nada.
//   • Escopo por tenant (nunca cruza lojas).
//
// Diferente do gatilho automático (que dispara em venda/cancelamento), este é o
// ÚNICO caminho que reprocessa um período inteiro sob demanda — e é auditado.
// A checagem de papel (ADM/MASTER/GERENTE_GERAL/FINANCEIRO) é feita na rota.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { recalculateSellerMainForPeriod } from '@/lib/commission/retroactive'

const MAIN_SCOPE = 'SELLER_MAIN_COMMISSION'

export interface RecalcSellerResult {
  sellerId: string
  sellerName: string | null
  count: number      // total de carros principais do vendedor no período
  repriced: number   // quantos lançamentos PREVISTO mudariam/mudaram
  oldTotal: number   // soma dos valores ANTES (apenas dos que mudam)
  newTotal: number   // soma dos valores DEPOIS (apenas dos que mudam)
  delta: number      // newTotal - oldTotal
}

export interface RecalcResult {
  period: string
  unitId: string | null
  sellerId: string | null
  dryRun: boolean
  sellers: RecalcSellerResult[]
  totalSellers: number
  totalRepriced: number
  oldTotal: number
  newTotal: number
  delta: number
}

/** yyyy-MM válido? */
export function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
}

// A data de referência do recálculo deve cair DENTRO do período (mês). Usar o
// dia 28 evita problemas de fuso/borda e serve à vigência das regras.
function referenceDateForPeriod(period: string): Date {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 28)
}

export async function recalcCommissionsForPeriod(opts: {
  tenantId: string | null
  period: string
  unitId?: string | null
  sellerId?: string | null
  dryRun: boolean
  triggeredBy?: string
}): Promise<RecalcResult> {
  const { tenantId, period } = opts
  const dryRun = opts.dryRun !== false
  const date = referenceDateForPeriod(period)

  // 1. Vendedores com lançamento principal no período (respeitando unidade/vendedor).
  const where: Record<string, unknown> = {
    tenantId,
    period,
    ruleType: 'VENDA',
    status: { not: 'CANCELADO' },
    sellerId: opts.sellerId ? opts.sellerId : { not: null },
    ruleDetails: { path: ['commissionScope'], equals: MAIN_SCOPE } as never,
  }
  if (opts.unitId) where.unitId = opts.unitId

  const distinctRows = await prisma.commissionCalculation.findMany({
    where: where as never,
    select: { sellerId: true },
    distinct: ['sellerId'],
  }).catch(() => [] as Array<{ sellerId: string | null }>)

  const sellerIds = distinctRows.map((r) => r.sellerId).filter((v): v is string => !!v)

  // 2. Nomes dos vendedores (para exibir na prévia).
  const sellers = await prisma.seller.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, fullName: true },
  }).catch(() => [] as Array<{ id: string; fullName: string | null }>)
  const nameById = new Map(sellers.map((s) => [s.id, s.fullName]))

  // 3. Reprecifica (ou simula) por vendedor.
  const results: RecalcSellerResult[] = []
  for (const sellerId of sellerIds) {
    const r = await recalculateSellerMainForPeriod({ tenantId, sellerId, period, date, dryRun })
    const oldTotal = r.changes.reduce((s, c) => s + c.oldValue, 0)
    const newTotal = r.changes.reduce((s, c) => s + c.newValue, 0)
    if (r.count === 0) continue
    results.push({
      sellerId,
      sellerName: nameById.get(sellerId) ?? null,
      count: r.count,
      repriced: r.repriced,
      oldTotal,
      newTotal,
      delta: newTotal - oldTotal,
    })
  }

  const totalRepriced = results.reduce((s, r) => s + r.repriced, 0)
  const oldTotal = results.reduce((s, r) => s + r.oldTotal, 0)
  const newTotal = results.reduce((s, r) => s + r.newTotal, 0)

  // 4. Auditoria (só quando aplicou de fato e houve mudança).
  if (!dryRun && totalRepriced > 0 && opts.triggeredBy) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId:   opts.triggeredBy,
        action:   'COMMISSIONS_RECALC_PERIOD',
        entity:   'CommissionCalculation',
        entityId: null,
        status:   'SUCCESS',
        afterData: {
          period,
          unitId: opts.unitId ?? null,
          sellerId: opts.sellerId ?? null,
          totalSellers: results.length,
          totalRepriced,
          oldTotal,
          newTotal,
          delta: newTotal - oldTotal,
        } as never,
      },
    }).catch(() => {})
  }

  return {
    period,
    unitId: opts.unitId ?? null,
    sellerId: opts.sellerId ?? null,
    dryRun,
    sellers: results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    totalSellers: results.length,
    totalRepriced,
    oldTotal,
    newTotal,
    delta: newTotal - oldTotal,
  }
}
