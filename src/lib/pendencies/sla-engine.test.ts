import { describe, it, expect } from 'vitest'
import { decidePendencyPopup } from './sla-engine'
import { PENDENCY_EVENT } from './events'
import type { PendencySlaEngineSettings } from './settings'

const cfg: PendencySlaEngineSettings = { enabled: true, requireCommitFor: ['ALTA', 'URGENTE'], maxDefer: 3, chargeIntervalHours: 4, staleHours: 6, overdueStrikesForCritical: 2, criticalStaleHours: 12, naggingL2Hours: 2, naggingL3Hours: 6, naggingPushIntervalMinutes: 45 }
const now = new Date('2026-07-09T12:00:00Z')

describe('decidePendencyPopup', () => {
  it('Média/Baixa nunca dispara pop-up', () => {
    expect(decidePendencyPopup({ priority: 'MEDIA', status: 'ABERTA', events: [], now, config: cfg }).kind).toBe('none')
    expect(decidePendencyPopup({ priority: 'BAIXA', status: 'ABERTA', events: [], now, config: cfg }).kind).toBe('none')
  })

  it('Alta sem prazo comprometido → commit bloqueante', () => {
    const d = decidePendencyPopup({ priority: 'ALTA', status: 'ABERTA', events: [], now, config: cfg })
    expect(d.kind).toBe('commit'); expect(d.blocking).toBe(true); expect(d.canDefer).toBe(true)
  })

  it('conta adiamentos e corta o botão adiar ao atingir o máximo', () => {
    const events = Array.from({ length: 3 }, (_, i) => ({ type: PENDENCY_EVENT.POPUP_DISMISSED, createdAt: `2026-07-0${i + 1}T10:00:00Z` }))
    const d = decidePendencyPopup({ priority: 'ALTA', status: 'ABERTA', events, now, config: cfg })
    expect(d.kind).toBe('commit'); expect(d.deferCount).toBe(3); expect(d.canDefer).toBe(false)
  })

  it('com prazo comprometido futuro → none (Alta e Urgente)', () => {
    const events = [{ type: PENDENCY_EVENT.COMMITMENT, newDueDate: '2026-07-10T12:00:00Z', createdAt: '2026-07-09T09:00:00Z' }]
    expect(decidePendencyPopup({ priority: 'URGENTE', status: 'EM_ANDAMENTO', events, now, config: cfg }).kind).toBe('none')
  })

  it('Urgente com prazo comprometido ESTOURADO → charge', () => {
    const events = [{ type: PENDENCY_EVENT.COMMITMENT, newDueDate: '2026-07-09T08:00:00Z', createdAt: '2026-07-08T09:00:00Z' }]
    const d = decidePendencyPopup({ priority: 'URGENTE', status: 'EM_ANDAMENTO', events, now, config: cfg })
    expect(d.kind).toBe('charge'); expect(d.overdue).toBe(true); expect(d.committedDueDate).toBe('2026-07-09T08:00:00.000Z')
  })

  it('Alta com prazo estourado NÃO cobra automaticamente (só Urgente)', () => {
    const events = [{ type: PENDENCY_EVENT.COMMITMENT, newDueDate: '2026-07-09T08:00:00Z', createdAt: '2026-07-08T09:00:00Z' }]
    expect(decidePendencyPopup({ priority: 'ALTA', status: 'EM_ANDAMENTO', events, now, config: cfg }).kind).toBe('none')
  })

  it('cobrança recente (dentro do intervalo) não recobra', () => {
    const events = [
      { type: PENDENCY_EVENT.COMMITMENT, newDueDate: '2026-07-09T08:00:00Z', createdAt: '2026-07-08T09:00:00Z' },
      { type: PENDENCY_EVENT.POPUP_SHOWN, content: 'charge', createdAt: '2026-07-09T10:00:00Z' }, // 2h atrás < 4h
    ]
    expect(decidePendencyPopup({ priority: 'URGENTE', status: 'EM_ANDAMENTO', events, now, config: cfg }).kind).toBe('none')
  })

  it('status resolvido/em validação para o ciclo', () => {
    expect(decidePendencyPopup({ priority: 'URGENTE', status: 'FINALIZADA', events: [], now, config: cfg }).kind).toBe('none')
    expect(decidePendencyPopup({ priority: 'URGENTE', status: 'AGUARDANDO_RESPOSTA', events: [], now, config: cfg }).kind).toBe('none')
  })

  it('motor desligado → none', () => {
    expect(decidePendencyPopup({ priority: 'URGENTE', status: 'ABERTA', events: [], now, config: { ...cfg, enabled: false } }).kind).toBe('none')
  })
})
