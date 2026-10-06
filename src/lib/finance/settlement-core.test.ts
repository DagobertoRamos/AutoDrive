import { describe, expect, it } from 'vitest'
import { baseSource, partialBlockedReason, partialSource, planSettlement, titleSummary } from './settlement-core'

describe('planSettlement', () => {
  it('quita o saldo quando o valor não é informado', () => {
    expect(planSettlement({ remaining: 1000 })).toEqual({ ok: true, kind: 'FULL', principal: 1000, interest: 0, discount: 0, paid: 1000, remainingAfter: 0 })
  })
  it('baixa parcial com juros e desconto', () => {
    expect(planSettlement({ remaining: 1000, principal: 400, interest: 12.5, discount: 2.5 })).toEqual({ ok: true, kind: 'PARTIAL', principal: 400, interest: 12.5, discount: 2.5, paid: 410, remainingAfter: 600 })
  })
  it('quitar o saldo como desconto', () => {
    expect(planSettlement({ remaining: 1000, principal: 950, settleRemainderAsDiscount: true })).toEqual({ ok: true, kind: 'FULL', principal: 1000, interest: 0, discount: 50, paid: 950, remainingAfter: 0 })
  })
  it('valida excesso, zero e desconto maior que o pago', () => {
    expect(planSettlement({ remaining: 100, principal: 100.01 }).ok).toBe(false)
    expect(planSettlement({ remaining: 100, principal: 0 }).ok).toBe(false)
    expect(planSettlement({ remaining: 100, principal: 10, discount: 20 }).ok).toBe(false)
    expect(planSettlement({ remaining: 0 }).ok).toBe(false)
  })
  it('tolerância de centavo vira quitação', () => {
    expect(planSettlement({ remaining: 100, principal: 99.999 })).toMatchObject({ ok: true, kind: 'FULL', remainingAfter: 0 })
  })
})

describe('titleSummary', () => {
  it('título em aberto com duas baixas parciais', () => {
    const s = titleSummary({ status: 'PREVISTO', amount: 300 }, [{ amount: 410, interestAmount: 12.5, discountAmount: 2.5 }, { amount: 300 }])
    expect(s).toEqual({ original: 1000, settled: 700, remaining: 300, paidTotal: 710, count: 2, partial: true })
  })
  it('título quitado na baixa final com juros', () => {
    const s = titleSummary({ status: 'PAGO', amount: 305, interestAmount: 5 }, [{ amount: 700 }])
    expect(s).toEqual({ original: 1000, settled: 1000, remaining: 0, paidTotal: 1005, count: 2, partial: false })
  })
})

describe('origem das baixas', () => {
  it('sufixo da baixa parcial e origem base', () => {
    expect(partialSource('NEG_DEBITO_abc', 2)).toBe('NEG_DEBITO_abc#P2')
    expect(partialSource(null, 1)).toBe('MANUAL#P1')
    expect(baseSource('NEG_DEBITO_abc#P2')).toBe('NEG_DEBITO_abc')
    expect(baseSource('MANUAL')).toBe('MANUAL')
  })
  it('bloqueia parcial em comissão, recebimento de venda e transferência', () => {
    expect(partialBlockedReason({ commissionCalculationId: 'c' })).toBeTruthy()
    expect(partialBlockedReason({ source: 'NEG_PGTO_x' })).toBeTruthy()
    expect(partialBlockedReason({ transferGroupId: 't' })).toBeTruthy()
    expect(partialBlockedReason({ source: 'NEG_DEBITO_x' })).toBeNull()
    expect(partialBlockedReason({ source: 'MANUAL' })).toBeNull()
  })
})
