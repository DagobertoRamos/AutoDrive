// =============================================================================
// Receitas/despesas fixas (FinancialRecurrence) — regras puras de calendário.
// Datas sempre "YYYY-MM-DD" (dia civil); o banco grava ao meio-dia UTC.
//   recurrenceDueDates → vencimentos de um intervalo de meses (dia limitado ao mês,
//                        respeitando início e fim da recorrência).
//   nextRecurrenceDue  → próximo vencimento a partir de hoje.
// =============================================================================

import { addMonthsYmd, daysInMonth } from './installments-core'

export type MonthKey = string // YYYY-MM

export const ymdOf = (d: Date) => d.toISOString().slice(0, 10)
/** Hoje (dia civil) em São Paulo. */
export const todaySpYmd = (now: Date = new Date()) => now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
export const noonUtc = (ymd: string) => new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`)
export const monthOfYmd = (ymd: string): MonthKey => ymd.slice(0, 7)

export function addMonthsKey(key: MonthKey, k: number): MonthKey {
  return addMonthsYmd(`${key}-01`, k).slice(0, 7)
}

/** Vencimento do mês `key` para o dia escolhido (31 em fevereiro → 28/29). */
export function dueInMonth(key: MonthKey, dayOfMonth: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = Math.min(Math.max(1, Math.floor(dayOfMonth)), daysInMonth(y, m))
  return `${key}-${String(d).padStart(2, '0')}`
}

export interface RecurrenceWindow {
  startDate: string        // YYYY-MM-DD
  endDate?: string | null  // YYYY-MM-DD
  dayOfMonth: number
}

/** Vencimentos (YYYY-MM-DD) dos meses `fromMonth`..`untilMonth` (inclusive) dentro de início/fim. */
export function recurrenceDueDates(rec: RecurrenceWindow, fromMonth: MonthKey, untilMonth: MonthKey): string[] {
  const out: string[] = []
  let key = fromMonth < monthOfYmd(rec.startDate) ? monthOfYmd(rec.startDate) : fromMonth
  for (let guard = 0; key <= untilMonth && guard < 600; guard++, key = addMonthsKey(key, 1)) {
    const due = dueInMonth(key, rec.dayOfMonth)
    if (due < rec.startDate.slice(0, 10)) continue
    if (rec.endDate && due > rec.endDate.slice(0, 10)) break
    out.push(due)
  }
  return out
}

/** Primeiro mês que ainda falta gerar (após `generatedUntil`, ou o mês de início). */
export function firstPendingMonth(rec: RecurrenceWindow & { generatedUntil?: string | null }): MonthKey {
  const start = monthOfYmd(rec.startDate)
  if (!rec.generatedUntil) return start
  const next = addMonthsKey(monthOfYmd(rec.generatedUntil), 1)
  return next < start ? start : next
}

/** Último mês da janela rolante: mês de hoje + horizonte. */
export function horizonMonth(todayYmd: string, horizonMonths: number): MonthKey {
  return addMonthsKey(monthOfYmd(todayYmd), Math.max(0, Math.floor(horizonMonths)))
}

/** Próximo vencimento >= hoje (null se a recorrência já terminou). */
export function nextRecurrenceDue(rec: RecurrenceWindow, todayYmd: string): string | null {
  const from = monthOfYmd(todayYmd)
  const dues = recurrenceDueDates(rec, from, addMonthsKey(from, 2))
  return dues.find((d) => d >= todayYmd) ?? null
}
