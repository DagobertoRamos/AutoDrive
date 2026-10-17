// =============================================================================
// dashboard/insights-core.ts — cálculo PURO das medidas de SLA/gargalo.
// =============================================================================

/** Amostras individuais (minutos, dias ou % por evento). */
export type InsightSample = number[]

/** Abaixo disso a média engana: devolve "dados insuficientes". */
export const MIN_INSIGHT_SAMPLE = 5

export interface Insight {
  id: string
  label: string
  unit: 'min' | 'dias' | '%'
  /** null = dados insuficientes. */
  value: number | null
  previous: number | null
  sample: number
  /** Variação relativa vs. período anterior (0.25 = +25%). */
  change: number | null
  /** true = piorou de forma relevante (≥ 15%). */
  worsened: boolean
  message: string
  href: string
}

export function average(values: InsightSample): number | null {
  if (!values.length) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function formatInsightValue(value: number, unit: Insight['unit']): string {
  if (unit === '%') return `${Math.round(value)}%`
  if (unit === 'min') {
    if (value >= 120) return `${(value / 60).toFixed(1).replace('.', ',')} h`
    return `${Math.round(value)} min`
  }
  // Menos de 1 dia fica mais legível em horas.
  if (value < 1) return `${(value * 24).toFixed(1).replace('.', ',')} h`
  return `${value.toFixed(1).replace('.', ',')} dias`
}

const RELEVANT_CHANGE = 0.15

export function buildInsight(input: {
  id: string
  label: string
  unit: Insight['unit']
  current: InsightSample
  previous: InsightSample
  href: string
  /** % de comparecimento: maior é melhor; tempos: menor é melhor. */
  higherIsBetter?: boolean
}): Insight {
  const enough = input.current.length >= MIN_INSIGHT_SAMPLE
  const value = enough ? average(input.current) : null
  const prevEnough = input.previous.length >= MIN_INSIGHT_SAMPLE
  const previous = prevEnough ? average(input.previous) : null
  const change = value != null && previous != null && previous > 0 ? (value - previous) / previous : null
  const worsened = change != null && (input.higherIsBetter ? change <= -RELEVANT_CHANGE : change >= RELEVANT_CHANGE)

  let message: string
  if (value == null) {
    message = 'Ainda não há dados suficientes.'
  } else if (previous != null && change != null && Math.abs(change) >= RELEVANT_CHANGE) {
    const verb = value > previous ? 'aumentou' : 'caiu'
    message = `${input.label} ${verb} de ${formatInsightValue(previous, input.unit)} para ${formatInsightValue(value, input.unit)}.`
  } else {
    message = `${input.label}: ${formatInsightValue(value, input.unit)} em média nos últimos 30 dias.`
  }

  return {
    id: input.id,
    label: input.label,
    unit: input.unit,
    value,
    previous,
    sample: input.current.length,
    change,
    worsened,
    message,
    href: input.href,
  }
}

/** "Maior gargalo atual": a medida que mais piorou; sem piora, nenhum. */
export function biggestBottleneck(insights: Insight[]): Insight | null {
  const worse = insights.filter((i) => i.worsened && i.change != null)
  if (!worse.length) return null
  return worse.sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))[0]
}
