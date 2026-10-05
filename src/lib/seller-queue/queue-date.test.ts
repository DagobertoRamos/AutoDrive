import { describe, expect, it } from 'vitest'
import { queueDate, queueDayStart } from './queue-date'

describe('queueDate (America/Sao_Paulo)', () => {
  it('mantém o dia de SP depois das 21:00 locais (já é o dia seguinte em UTC)', () => {
    // 2026-10-05 22:30 em SP = 2026-10-06 01:30 UTC
    expect(queueDate(new Date('2026-10-06T01:30:00Z')).toISOString()).toBe('2026-10-05T00:00:00.000Z')
  })
  it('vira o dia à meia-noite de SP', () => {
    expect(queueDate(new Date('2026-10-06T02:59:59Z')).toISOString()).toBe('2026-10-05T00:00:00.000Z')
    expect(queueDate(new Date('2026-10-06T03:00:00Z')).toISOString()).toBe('2026-10-06T00:00:00.000Z')
  })
  it('queueDayStart = 00:00 de SP (03:00 UTC)', () => {
    expect(queueDayStart(new Date('2026-10-06T01:30:00Z')).toISOString()).toBe('2026-10-05T03:00:00.000Z')
    expect(queueDayStart(new Date('2026-10-06T15:00:00Z')).toISOString()).toBe('2026-10-06T03:00:00.000Z')
  })
})
