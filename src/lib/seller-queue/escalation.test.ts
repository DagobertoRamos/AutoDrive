import { describe, expect, it } from 'vitest'
import { planNextEscalation, type EscalationState } from '@/lib/seller-queue/escalation'
import { coerceEscalationConfig, readEscalationConfig, nextActiveLevelIndex, firstActiveLevelIndex, DEFAULT_ESCALATION_CONFIG, type EscalationConfig } from '@/lib/seller-queue/escalation-config'

const cfg: EscalationConfig = coerceEscalationConfig({
  active: true,
  levels: [
    { id: 'a', name: 'Vez', targetType: 'VENDEDOR_DA_VEZ', timeoutSeconds: 30, maxAttempts: 2, notifyAll: false, active: true },
    { id: 'b', name: 'Líder', targetType: 'VENDEDOR_LIDER', timeoutSeconds: 30, maxAttempts: 1, notifyAll: true, active: true },
    { id: 'c', name: 'Gerente', targetType: 'GERENTE', timeoutSeconds: 45, maxAttempts: 1, notifyAll: true, active: false },
    { id: 'd', name: 'GG', targetType: 'GERENTE_GERAL', timeoutSeconds: 60, maxAttempts: 1, notifyAll: true, active: true },
  ],
})

const init: EscalationState = { levelIndex: -1, attempt: 0 }

describe('planNextEscalation', () => {
  it('estado inicial → primeiro nível ativo, tentativa 1', () => {
    const s = planNextEscalation(cfg, init)
    expect(s.done).toBe(false)
    if (!s.done) { expect(s.levelIndex).toBe(0); expect(s.attempt).toBe(1); expect(s.timeoutSeconds).toBe(30) }
  })

  it('repete o mesmo nível enquanto houver tentativas (maxAttempts=2)', () => {
    const s = planNextEscalation(cfg, { levelIndex: 0, attempt: 1 })
    expect(s.done).toBe(false)
    if (!s.done) { expect(s.levelIndex).toBe(0); expect(s.attempt).toBe(2) }
  })

  it('esgotou as tentativas do nível → próximo nível ativo', () => {
    const s = planNextEscalation(cfg, { levelIndex: 0, attempt: 2 })
    expect(s.done).toBe(false)
    if (!s.done) { expect(s.levelIndex).toBe(1); expect(s.attempt).toBe(1) }
  })

  it('pula nível INATIVO (índice 2) e vai para o próximo ativo (3)', () => {
    const s = planNextEscalation(cfg, { levelIndex: 1, attempt: 1 })
    expect(s.done).toBe(false)
    if (!s.done) { expect(s.levelIndex).toBe(3); expect(s.timeoutSeconds).toBe(60) }
  })

  it('último nível ativo → esgotado', () => {
    const s = planNextEscalation(cfg, { levelIndex: 3, attempt: 1 })
    expect(s.done).toBe(true)
  })

  it('nextActiveLevelIndex / firstActiveLevelIndex ignoram inativos', () => {
    expect(firstActiveLevelIndex(cfg.levels)).toBe(0)
    expect(nextActiveLevelIndex(cfg.levels, 1)).toBe(3) // pula o 2 (inativo)
  })
})

describe('coerce/read escalation config', () => {
  it('default inativo com 4 níveis', () => {
    expect(DEFAULT_ESCALATION_CONFIG.active).toBe(false)
    expect(DEFAULT_ESCALATION_CONFIG.levels.length).toBe(4)
  })

  it('coerce sanea targetType inválido → COLABORADORES e clampa tempos/tentativas', () => {
    const c = coerceEscalationConfig({ active: true, levels: [{ name: 'X', targetType: 'ZZZ', timeoutSeconds: 5, maxAttempts: 999 }] })
    expect(c.levels[0].targetType).toBe('COLABORADORES')
    expect(c.levels[0].timeoutSeconds).toBe(10) // min
    expect(c.levels[0].maxAttempts).toBe(20)    // max
  })

  it('readEscalationConfig sem bloco → default (novo array de níveis)', () => {
    const r = readEscalationConfig({ outra: 1 })
    expect(r.active).toBe(false)
    expect(r.levels.length).toBe(4)
  })

  it('readEscalationConfig lê o bloco escalation', () => {
    const r = readEscalationConfig({ escalation: { active: true, levels: [{ name: 'A', targetType: 'GERENTE', timeoutSeconds: 40, maxAttempts: 1 }] } })
    expect(r.active).toBe(true)
    expect(r.levels[0].targetType).toBe('GERENTE')
  })
})
