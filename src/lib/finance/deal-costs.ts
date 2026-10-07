// Custos e comissões das negociações — compartilhado entre relatórios e o
// resultado da negociação (deal-result.ts).

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { commissionRefOf } from './result-centers'
import { r2 } from './reports-core'

export type CostStatus = 'PAGO' | 'PREVISTO' | 'CADASTRO' | 'SEM_CUSTO'

export interface DealCommission { ruleType: string; dealId: string | null; serviceId: string | null; warrantySaleId: string | null; value: number }

/** Comissões não canceladas das negociações (ruleDetails.dealId). */
export async function loadDealCommissions(tenantId: string, dealIds: string[]): Promise<DealCommission[]> {
  const out: DealCommission[] = []
  for (let i = 0; i < dealIds.length; i += 2000) {
    const chunk = dealIds.slice(i, i + 2000)
    const rows = await prisma.$queryRaw<{ ruleType: string; commissionValue: unknown; ruleDetails: unknown }[]>(Prisma.sql`
      SELECT "ruleType"::text AS "ruleType", "commissionValue", "ruleDetails"
      FROM commission_calculations
      WHERE "tenantId" = ${tenantId} AND status::text <> 'CANCELADO' AND ("ruleDetails"->>'dealId') IN (${Prisma.join(chunk)})`)
    for (const r of rows) out.push({ ...commissionRefOf(r), value: Number(r.commissionValue ?? 0) })
  }
  return out
}

export type CostEntry = { amount: number; status: string; supplier: string | null; items: { description: string; amount: number }[] }
export const costOf = (entries: CostEntry[], fallback: number) => {
  if (!entries.length) return { cost: r2(fallback), status: (fallback > 0 ? 'CADASTRO' : 'SEM_CUSTO') as CostStatus, items: [] as { description: string; amount: number }[] }
  return {
    cost: r2(entries.reduce((s, e) => s + e.amount, 0)),
    status: (entries.every((e) => e.status === 'PAGO') ? 'PAGO' : 'PREVISTO') as CostStatus,
    items: entries.flatMap((e) => e.items),
  }
}

