// =============================================================================
// Carga do razão (Prisma → tipos puros de ledger.ts). Usado pelas rotas
// /api/finance/center/{overview,statement,cashflow}. Sempre por loja.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { LedgerAccount, LedgerEntry, LedgerStatus, LedgerType } from './ledger'

export interface CenterAccount extends LedgerAccount {
  type: string
  color: string | null
  bankName: string | null
}

export async function loadAccounts(tenantId: string): Promise<CenterAccount[]> {
  const rows = await prisma.financialAccount.findMany({
    where: { tenantId },
    select: { id: true, name: true, type: true, color: true, bankName: true, openingBalance: true, openingDate: true, includeInTotal: true, active: true },
    orderBy: { name: 'asc' },
  })
  return rows.map((a) => ({ ...a, openingBalance: Number(a.openingBalance ?? 0) }))
}

const ENTRY_SELECT = {
  id: true, type: true, status: true, amount: true, paidDate: true, dueDate: true, competenceDate: true,
  accountId: true, transferGroupId: true, categoryId: true, costCenterId: true,
} satisfies Prisma.FinancialEntrySelect

export type CenterEntry = LedgerEntry & { categoryId: string | null; costCenterId: string | null }

type Row = Prisma.FinancialEntryGetPayload<{ select: typeof ENTRY_SELECT }>
const toEntry = (r: Row): CenterEntry => ({
  id: r.id, type: r.type as LedgerType, status: r.status as LedgerStatus, amount: Number(r.amount ?? 0),
  paidDate: r.paidDate, dueDate: r.dueDate, competenceDate: r.competenceDate,
  accountId: r.accountId, transferGroupId: r.transferGroupId, categoryId: r.categoryId, costCenterId: r.costCenterId,
})

/** Realizados (RECEBIDO/PAGO) da loja — base de todos os saldos. */
export async function loadRealized(tenantId: string, extra: Prisma.FinancialEntryWhereInput = {}): Promise<CenterEntry[]> {
  const rows = await prisma.financialEntry.findMany({
    where: { ...extra, tenantId, status: { in: ['PAGO', 'RECEBIDO'] } },
    select: ENTRY_SELECT,
  })
  return rows.map(toEntry)
}

/** Previstos (a pagar/receber) com vencimento. */
export async function loadPending(tenantId: string, extra: Prisma.FinancialEntryWhereInput = {}): Promise<CenterEntry[]> {
  const rows = await prisma.financialEntry.findMany({
    where: { ...extra, tenantId, status: 'PREVISTO', dueDate: { not: null } },
    select: ENTRY_SELECT,
  })
  return rows.map(toEntry)
}
