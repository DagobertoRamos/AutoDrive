import { describe, expect, it } from 'vitest'
import { healthNoticeKey, tokenHealth } from './health'

describe('tokenHealth', () => {
  const now = new Date('2026-09-27T12:00:00Z')
  it('sem vencimento = permanente', () => expect(tokenHealth(null, now)).toBe('OK'))
  it('vencido', () => expect(tokenHealth(new Date('2026-09-26T22:00:00Z'), now)).toBe('VENCIDO'))
  it('vence em até 7 dias', () => expect(tokenHealth(new Date('2026-10-02T12:00:00Z'), now)).toBe('VENCENDO'))
  it('longe do vencimento', () => expect(tokenHealth(new Date('2026-11-20T12:00:00Z'), now)).toBe('OK'))
  it('chave de aviso muda com o tipo e a data', () => {
    const d = new Date('2026-09-26T22:00:00Z')
    expect(healthNoticeKey('VENCIDO', d)).not.toBe(healthNoticeKey('VENCENDO', d))
  })
})
