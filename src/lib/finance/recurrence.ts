// =============================================================================
// Receitas/despesas fixas — geração dos lançamentos PREVISTOS mês a mês
// (janela rolante: hoje + horizonte). Idempotente: `generatedUntil` marca o
// último mês gerado e cada mês só ganha um lançamento por recorrência (mesmo
// que o lançamento tenha sido cancelado/baixado). Roda no cadastro/edição da
// recorrência e no cron diário /api/internal/finance/recurrences/run.
// Regras de calendário em recurrence-core.ts.
// =============================================================================

import type { FinancialRecurrence, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  dueInMonth, firstPendingMonth, horizonMonth, monthOfYmd, nextRecurrenceDue, noonUtc, recurrenceDueDates, todaySpYmd, ymdOf,
} from './recurrence-core'

export const RECURRENCE_SOURCE = 'RECORRENCIA'
export const DEFAULT_HORIZON_MONTHS = 3

type Rec = Pick<FinancialRecurrence,
  'id' | 'tenantId' | 'type' | 'description' | 'amount' | 'accountId' | 'categoryId' | 'costCenterId' | 'supplierId' |
  'employeeUserId' | 'counterparty' | 'dayOfMonth' | 'startDate' | 'endDate' | 'active' | 'generatedUntil' | 'createdById'>

const windowOf = (r: Rec) => ({
  startDate: ymdOf(r.startDate), endDate: r.endDate ? ymdOf(r.endDate) : null, dayOfMonth: r.dayOfMonth,
  generatedUntil: r.generatedUntil ? ymdOf(r.generatedUntil) : null,
})

/** Gera os meses que faltam de uma recorrência. Retorna quantos lançamentos criou. */
export async function generateForRecurrence(rec: Rec, horizonMonths = DEFAULT_HORIZON_MONTHS, today = todaySpYmd()): Promise<number> {
  if (!rec.active) return 0
  const w = windowOf(rec)
  const until = horizonMonth(today, horizonMonths)
  const from = firstPendingMonth(w)
  if (from > until) return 0
  const dues = recurrenceDueDates(w, from, until)

  let created = 0
  if (dues.length) {
    const existing = await prisma.financialEntry.findMany({
      where: { recurrenceId: rec.id, dueDate: { gte: noonUtc(`${from}-01`) } },
      select: { dueDate: true },
    })
    const have = new Set(existing.map((e) => (e.dueDate ? monthOfYmd(ymdOf(e.dueDate)) : '')))
    const missing = dues.filter((d) => !have.has(monthOfYmd(d)))
    if (missing.length) {
      const res = await prisma.financialEntry.createMany({
        data: missing.map((d) => ({
          tenantId: rec.tenantId, type: rec.type, status: 'PREVISTO' as const, description: rec.description, amount: rec.amount,
          dueDate: noonUtc(d), competenceDate: noonUtc(d), accountId: rec.accountId, categoryId: rec.categoryId,
          costCenterId: rec.costCenterId, supplierId: rec.supplierId, employeeUserId: rec.employeeUserId,
          counterparty: rec.counterparty, recurrenceId: rec.id, source: RECURRENCE_SOURCE, createdById: rec.createdById,
        })),
      })
      created = res.count
    }
  }
  await prisma.financialRecurrence.update({ where: { id: rec.id }, data: { generatedUntil: noonUtc(`${until}-01`) } })
  return created
}

/** Gera para todas as recorrências ativas (de uma loja ou de todas). */
export async function generateRecurrences(tenantId?: string | null, horizonMonths = DEFAULT_HORIZON_MONTHS): Promise<{ recurrences: number; created: number; errors: number }> {
  const today = todaySpYmd()
  const until = horizonMonth(today, horizonMonths)
  const recs = await prisma.financialRecurrence.findMany({
    where: {
      active: true, ...(tenantId ? { tenantId } : {}),
      OR: [{ generatedUntil: null }, { generatedUntil: { lt: noonUtc(`${until}-01`) } }],
    },
  })
  let created = 0; let errors = 0
  for (const r of recs) {
    try { created += await generateForRecurrence(r, horizonMonths, today) } catch (err) {
      errors++
      console.error('[finance/recurrence] falha ao gerar', r.id, err)
    }
  }
  return { recurrences: recs.length, created, errors }
}

/**
 * Edição da recorrência reflete SÓ nos lançamentos futuros ainda previstos:
 * valor, dia, descrição, conta, categoria, centro de custo, fornecedor. Fora da
 * nova vigência (antes do início / depois do fim) eles são cancelados.
 */
export async function applyRecurrenceToFuture(rec: Rec, prev: Pick<Rec, 'dayOfMonth'>): Promise<void> {
  const today = todaySpYmd()
  // Títulos com baixa parcial ficam como estão (o saldo já foi negociado).
  const baseWhere = { recurrenceId: rec.id, status: 'PREVISTO' as const, dueDate: { gte: noonUtc(today) }, partials: { none: { status: { not: 'CANCELADO' as const } } } }
  const outside: Prisma.FinancialEntryWhereInput[] = [{ dueDate: { lt: rec.startDate } }]
  if (rec.endDate) outside.push({ dueDate: { gt: noonUtc(ymdOf(rec.endDate)) } })
  await prisma.financialEntry.updateMany({ where: { ...baseWhere, OR: outside }, data: { status: 'CANCELADO' } })

  const common = {
    amount: rec.amount, description: rec.description, accountId: rec.accountId, categoryId: rec.categoryId,
    costCenterId: rec.costCenterId, supplierId: rec.supplierId, counterparty: rec.counterparty, employeeUserId: rec.employeeUserId,
  }
  if (prev.dayOfMonth === rec.dayOfMonth) {
    await prisma.financialEntry.updateMany({ where: baseWhere, data: common })
    return
  }
  const future = await prisma.financialEntry.findMany({ where: baseWhere, select: { id: true, dueDate: true } })
  for (const e of future) {
    const due = dueInMonth(monthOfYmd(ymdOf(e.dueDate!)), rec.dayOfMonth)
    // Novo dia já passou neste mês: mantém a data atual (não cria vencido do nada).
    const dueDate = due >= today ? noonUtc(due) : e.dueDate!
    await prisma.financialEntry.update({ where: { id: e.id }, data: { ...common, dueDate, competenceDate: dueDate } })
  }
}

/** Pausa/encerramento: cancela os lançamentos futuros ainda previstos. */
export async function cancelFutureEntries(recurrenceId: string): Promise<number> {
  const r = await prisma.financialEntry.updateMany({
    where: { recurrenceId, status: 'PREVISTO', dueDate: { gte: noonUtc(todaySpYmd()) } },
    data: { status: 'CANCELADO' },
  })
  return r.count
}

/** Retomada: reabre os futuros cancelados pela pausa. */
export async function reopenFutureEntries(recurrenceId: string): Promise<number> {
  const r = await prisma.financialEntry.updateMany({
    where: { recurrenceId, status: 'CANCELADO', paidDate: null, dueDate: { gte: noonUtc(todaySpYmd()) } },
    data: { status: 'PREVISTO' },
  })
  return r.count
}

/** Próximo vencimento + quantidade de lançamentos gerados, para as listas. */
export async function recurrenceStats(recs: Rec[]): Promise<Map<string, { nextDueDate: string | null; generated: number }>> {
  const ids = recs.map((r) => r.id)
  const today = todaySpYmd()
  const [counts, nextPending] = await Promise.all([
    ids.length ? prisma.financialEntry.groupBy({ by: ['recurrenceId'], where: { recurrenceId: { in: ids } }, _count: { _all: true } }) : [],
    ids.length ? prisma.financialEntry.groupBy({
      by: ['recurrenceId'], where: { recurrenceId: { in: ids }, status: 'PREVISTO', dueDate: { gte: noonUtc(today) } }, _min: { dueDate: true },
    }) : [],
  ])
  const cnt = new Map(counts.map((c) => [c.recurrenceId!, c._count._all]))
  const nxt = new Map(nextPending.map((c) => [c.recurrenceId!, c._min.dueDate]))
  return new Map(recs.map((r) => {
    const pending = nxt.get(r.id)
    const next = !r.active ? null : pending ? ymdOf(pending) : nextRecurrenceDue(windowOf(r), today)
    return [r.id, { nextDueDate: next, generated: cnt.get(r.id) ?? 0 }]
  }))
}
