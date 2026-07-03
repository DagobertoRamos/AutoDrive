// =============================================================================
// commission/decendial.ts — BÔNUS DEZENAL (Parte 4).
//
// Além do bônus por quantidade MENSAL, existe um bônus por "dezena" (janela de
// ~10 dias dentro do mês) que premia o vendedor por bater metas de curto prazo:
//   • 1ª dezena → dias 01–10
//   • 2ª dezena → dias 11–20
//   • 3ª dezena → dias 21 até o último dia do mês (28, 29, 30 ou 31)
//
// Cada negociação cai em UMA dezena (pela data de referência da comissão). O
// bônus dezenal é contado dentro dessa janela e SOMA com os demais bônus — não
// substitui o bônus mensal. A regra usada é do tipo `BONUS_DEZENA` (faixas por
// quantidade: fromQuantity/toQuantity + fixedValue/percentual).
// =============================================================================

export interface DecendPeriod {
  /** Chave estável da dezena, ex.: "2026-07-D1". Usada em ruleDetails.bonusPeriod. */
  key: string
  /** Código estável para snapshots/metadados da regra. */
  code: DecendCode
  /** 1 | 2 | 3 — número da dezena no mês. */
  index: 1 | 2 | 3
  /** Início inclusivo da janela (00:00 do primeiro dia da dezena). */
  start: Date
  /** Fim EXCLUSIVO da janela (00:00 do primeiro dia da dezena seguinte / mês). */
  end: Date
  /** Rótulo legível, ex.: "1ª dezena de julho". */
  label: string
  /** Rótulo curto de faixa, ex.: "01 a 10" ou "21 a 31". */
  rangeLabel: string
  /** Primeiro dia civil da dezena. */
  startDay: number
  /** Último dia civil incluso da dezena. */
  endDay: number
}

export type DecendCode = 'FIRST_DECEND' | 'SECOND_DECEND' | 'THIRD_DECEND'

const DECEND_BY_INDEX: Record<1 | 2 | 3, DecendCode> = {
  1: 'FIRST_DECEND',
  2: 'SECOND_DECEND',
  3: 'THIRD_DECEND',
}

const INDEX_BY_DECEND: Record<DecendCode, 1 | 2 | 3> = {
  FIRST_DECEND: 1,
  SECOND_DECEND: 2,
  THIRD_DECEND: 3,
}

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function padDay(day: number): string {
  return String(day).padStart(2, '0')
}

export function decendCodeFromIndex(index: 1 | 2 | 3): DecendCode {
  return DECEND_BY_INDEX[index]
}

export function decendIndexFromCode(decend: DecendCode): 1 | 2 | 3 {
  return INDEX_BY_DECEND[decend]
}

export function decendName(decend: DecendCode): string {
  if (decend === 'FIRST_DECEND') return 'Primeira dezena'
  if (decend === 'SECOND_DECEND') return 'Segunda dezena'
  return 'Terceira dezena'
}

/**
 * Retorna a janela de uma dezena em um mês específico.
 * `month` é 1-based (janeiro = 1), como o usuário informa em telas/relatórios.
 * O retorno usa `endExclusive` para evitar erro de horário no último dia.
 */
export function getDecendDateRange(year: number, month: number, decend: DecendCode) {
  if (!Number.isInteger(year) || year < 1900) throw new Error('Ano inválido.')
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Mês inválido.')

  const zeroMonth = month - 1
  const index = decendIndexFromCode(decend)
  const lastDay = new Date(year, month, 0).getDate()
  const startDay = index === 1 ? 1 : index === 2 ? 11 : 21
  const endDay = index === 1 ? 10 : index === 2 ? 20 : lastDay
  const start = new Date(year, zeroMonth, startDay)
  const endExclusive = index === 3 ? new Date(year, zeroMonth + 1, 1) : new Date(year, zeroMonth, endDay + 1)
  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  return {
    key: `${monthKey}-D${index}`,
    code: decend,
    index,
    start,
    endExclusive,
    end: endExclusive,
    startDay,
    endDay,
    label: `${index}ª dezena de ${MESES_PT[zeroMonth]}`,
    rangeLabel: `${padDay(startDay)} a ${padDay(endDay)}`,
  }
}

/**
 * Retorna a dezena (janela decendial) que contém a data informada.
 * A 3ª dezena vai do dia 21 ao fim do mês — o `end` é sempre o dia 1 do mês
 * seguinte, então 28/29/30/31 dias são tratados automaticamente.
 */
export function getDecendPeriod(date: Date): DecendPeriod {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const day = date.getDate()

  let index: 1 | 2 | 3
  if (day <= 10) index = 1
  else if (day <= 20) index = 2
  else index = 3

  const range = getDecendDateRange(y, m, decendCodeFromIndex(index))
  return { ...range, end: range.endExclusive }
}
