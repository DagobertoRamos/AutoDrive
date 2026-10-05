// Limites de dia/mês no fuso de São Paulo para filtros de relatório (o servidor
// roda em UTC; `new Date('2026-10-01')` cairia às 21h do dia anterior em SP).
import { getGoalPeriod } from '@/lib/goals/service'

const TZ = 'America/Sao_Paulo'
const YMD = /^\d{4}-\d{2}-\d{2}$/

// Meio-dia UTC cai no mesmo dia civil em SP — referência segura p/ o período diário.
const noonUtc = (ymd: string) => new Date(`${ymd}T12:00:00.000Z`)

/** Início (00:00 SP) do dia `YYYY-MM-DD`. */
export function spDayStart(ymd: string): Date {
  if (!YMD.test(ymd)) return new Date(ymd)
  return getGoalPeriod({ frequency: 'daily', referenceDate: noonUtc(ymd), timezone: TZ }).startsAt
}

/** Fim (23:59:59.999 SP) do dia `YYYY-MM-DD`. */
export function spDayEnd(ymd: string): Date {
  if (!YMD.test(ymd)) return new Date(ymd)
  return getGoalPeriod({ frequency: 'daily', referenceDate: noonUtc(ymd), timezone: TZ }).endsAt
}

const monthFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })

/** Chave `YYYY-MM` do mês civil em SP. */
export function spMonthKey(d: Date | null | undefined): string {
  if (!d) return '—'
  const parts = Object.fromEntries(monthFmt.formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}`
}
