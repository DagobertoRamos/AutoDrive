import { describe, it, expect } from 'vitest'
import { criticalSince, criticalLevel, shouldBecomeCritical } from './nagging'
import { PENDENCY_EVENT } from './events'
import type { PendencySlaEngineSettings } from './settings'

const cfg: PendencySlaEngineSettings = {
  enabled: true, requireCommitFor: ['ALTA', 'URGENTE'], maxDefer: 3, chargeIntervalHours: 4, staleHours: 6,
  overdueStrikesForCritical: 2, criticalStaleHours: 12, naggingL2Hours: 2, naggingL3Hours: 6, naggingPushIntervalMinutes: 45,
}
const now = new Date('2026-07-09T12:00:00Z')

describe('criticalSince', () => {
  it('pega o primeiro CRITICAL_RAISED', () => {
    const since = criticalSince([
      { type: PENDENCY_EVENT.CRITICAL_RAISED, createdAt: '2026-07-09T10:00:00Z' },
      { type: PENDENCY_EVENT.CRITICAL_RAISED, createdAt: '2026-07-09T11:00:00Z' },
    ])
    expect(since?.toISOString()).toBe('2026-07-09T10:00:00.000Z')
  })
  it('null quando nunca foi crítica', () => {
    expect(criticalSince([{ type: PENDENCY_EVENT.RESPONSE, createdAt: '2026-07-09T10:00:00Z' }])).toBeNull()
  })
})

describe('criticalLevel', () => {
  it('mapeia horas em Crítica para 1/2/3', () => {
    expect(criticalLevel(null, now, cfg)).toBe(0)
    expect(criticalLevel(new Date('2026-07-09T11:00:00Z'), now, cfg)).toBe(1) // 1h
    expect(criticalLevel(new Date('2026-07-09T09:30:00Z'), now, cfg)).toBe(2) // 2.5h
    expect(criticalLevel(new Date('2026-07-09T05:00:00Z'), now, cfg)).toBe(3) // 7h
  })
})

describe('shouldBecomeCritical', () => {
  it('2 prazos comprometidos estourados → crítica', () => {
    const events = [
      { type: PENDENCY_EVENT.COMMITMENT, newDueDate: '2026-07-08T10:00:00Z', createdAt: '2026-07-07T10:00:00Z' },
      { type: PENDENCY_EVENT.COMMITMENT, newDueDate: '2026-07-09T08:00:00Z', createdAt: '2026-07-08T10:00:00Z' },
    ]
    const r = shouldBecomeCritical({ priority: 'ALTA', severity: null, status: 'EM_ANDAMENTO', events, now, cfg })
    expect(r.critical).toBe(true)
  })
  it('1 prazo estourado ainda não vira crítica', () => {
    const events = [{ type: PENDENCY_EVENT.COMMITMENT, newDueDate: '2026-07-08T10:00:00Z', createdAt: '2026-07-07T10:00:00Z' }]
    expect(shouldBecomeCritical({ priority: 'ALTA', severity: null, status: 'EM_ANDAMENTO', events, now, cfg }).critical).toBe(false)
  })
  it('Urgente sem resposta há mais de 12h → crítica', () => {
    const events = [{ type: PENDENCY_EVENT.CREATED, createdAt: '2026-07-08T23:00:00Z' }] // 13h atrás
    expect(shouldBecomeCritical({ priority: 'URGENTE', severity: null, status: 'ABERTA', events, now, cfg }).critical).toBe(true)
  })
  it('Urgente com resposta recente não vira crítica', () => {
    const events = [
      { type: PENDENCY_EVENT.CREATED, createdAt: '2026-07-08T23:00:00Z' },
      { type: PENDENCY_EVENT.RESPONSE, createdAt: '2026-07-09T11:00:00Z' },
    ]
    expect(shouldBecomeCritical({ priority: 'URGENTE', severity: null, status: 'EM_ANDAMENTO', events, now, cfg }).critical).toBe(false)
  })
  it('já crítica ou encerrada → não redispara', () => {
    expect(shouldBecomeCritical({ priority: 'URGENTE', severity: 'CRITICAL', status: 'EM_ANDAMENTO', events: [], now, cfg }).critical).toBe(false)
    expect(shouldBecomeCritical({ priority: 'URGENTE', severity: null, status: 'FINALIZADA', events: [], now, cfg }).critical).toBe(false)
  })
})
