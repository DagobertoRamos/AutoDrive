import { describe, expect, it } from 'vitest'
import { isCommissionEligibleStatus } from '@/lib/commission/status'

describe('isCommissionEligibleStatus', () => {
  it('considera aguardando contrato elegivel para comissao', () => {
    expect(isCommissionEligibleStatus('AGUARDANDO_CONTRATO')).toBe(true)
  })

  it('considera status aprovados e posteriores elegiveis', () => {
    expect(isCommissionEligibleStatus('APROVADA')).toBe(true)
    expect(isCommissionEligibleStatus('CONTRATO_GERADO')).toBe(true)
    expect(isCommissionEligibleStatus('FINALIZADA')).toBe(true)
  })

  it('bloqueia rascunho, aguardando aprovacao, reprovada e cancelada', () => {
    expect(isCommissionEligibleStatus('RASCUNHO')).toBe(false)
    expect(isCommissionEligibleStatus('AGUARDANDO_APROVACAO')).toBe(false)
    expect(isCommissionEligibleStatus('DESAPROVADA')).toBe(false)
    expect(isCommissionEligibleStatus('CANCELADA')).toBe(false)
  })
})
