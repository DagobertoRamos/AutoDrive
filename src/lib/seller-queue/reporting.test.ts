import { describe, expect, it } from 'vitest'
import { getPrimaryRiskReason, getRecommendedAction } from '@/lib/seller-queue/reporting'

describe('seller-queue/reporting', () => {
  it('prioriza alta gravidade quando ela domina o score', () => {
    expect(getPrimaryRiskReason({
      highSeverity: 3,
      confirmed: 1,
      cases: 2,
      compliancePoints: 5,
    })).toBe('Alta gravidade')
  })

  it('reconhece impacto no ranking quando ele pesa mais', () => {
    expect(getPrimaryRiskReason({
      highSeverity: 0,
      confirmed: 0,
      cases: 1,
      compliancePoints: 28,
    })).toBe('Impacto no ranking')
  })

  it('gera acao sugerida coerente para confirmadas', () => {
    expect(getRecommendedAction('Confirmadas')).toBe('Auditar as confirmações recentes e alinhar o processo.')
  })
})
