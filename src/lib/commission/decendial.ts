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
  /** 1 | 2 | 3 — número da dezena no mês. */
  index: 1 | 2 | 3
  /** Início inclusivo da janela (00:00 do primeiro dia da dezena). */
  start: Date
  /** Fim EXCLUSIVO da janela (00:00 do primeiro dia da dezena seguinte / mês). */
  end: Date
  /** Rótulo legível, ex.: "1ª dezena de julho". */
  label: string
}

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * Retorna a dezena (janela decendial) que contém a data informada.
 * A 3ª dezena vai do dia 21 ao fim do mês — o `end` é sempre o dia 1 do mês
 * seguinte, então 28/29/30/31 dias são tratados automaticamente.
 */
export function getDecendPeriod(date: Date): DecendPeriod {
  const y = date.getFullYear()
  const m = date.getMonth() // 0-based
  const day = date.getDate()

  let index: 1 | 2 | 3
  let startDay: number
  let endDay: number | null // dia (inclusivo) onde a próxima janela começa; null = mês seguinte

  if (day <= 10) {
    index = 1
    startDay = 1
    endDay = 11
  } else if (day <= 20) {
    index = 2
    startDay = 11
    endDay = 21
  } else {
    index = 3
    startDay = 21
    endDay = null // até o fim do mês
  }

  const start = new Date(y, m, startDay)
  const end = endDay == null ? new Date(y, m + 1, 1) : new Date(y, m, endDay)

  const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`
  return {
    key: `${monthKey}-D${index}`,
    index,
    start,
    end,
    label: `${index}ª dezena de ${MESES_PT[m]}`,
  }
}
