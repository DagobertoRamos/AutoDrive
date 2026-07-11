export type RiskReasonLabel =
  | 'Alta gravidade'
  | 'Confirmadas'
  | 'Volume de casos'
  | 'Impacto no ranking'

export function getPrimaryRiskReason(input: {
  highSeverity: number
  confirmed: number
  cases: number
  compliancePoints: number
}): RiskReasonLabel {
  const reasons = [
    { label: 'Alta gravidade' as const, value: input.highSeverity * 4 },
    { label: 'Confirmadas' as const, value: input.confirmed * 3 },
    { label: 'Volume de casos' as const, value: input.cases * 2 },
    { label: 'Impacto no ranking' as const, value: Math.min(input.compliancePoints, 30) },
  ].sort((a, b) => b.value - a.value)

  return reasons[0]?.label ?? 'Volume de casos'
}

export function getRecommendedAction(primaryReason: RiskReasonLabel): string {
  if (primaryReason === 'Alta gravidade') return 'Revisar imediatamente os casos de maior gravidade.'
  if (primaryReason === 'Confirmadas') return 'Auditar as confirmações recentes e alinhar o processo.'
  if (primaryReason === 'Impacto no ranking') return 'Reduzir o impacto operacional que já afeta a pontuação.'
  return 'Atacar a reincidência e acompanhar o comportamento da fila.'
}
