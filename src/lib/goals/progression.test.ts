import { describe, it, expect } from 'vitest'
import { currentLevel, nextLevelTarget } from '@/lib/goals/service'

// Níveis configurados (sem hardcode no código): 10 / 20 / 30
const levels = [
  { level: 1, targetValue: 10 },
  { level: 2, targetValue: 20 },
  { level: 3, targetValue: 30 },
] as never

describe('progressão de meta (sem hardcode)', () => {
  it('meta simples: nível 1 se atingiu o alvo base, senão 0', () => {
    expect(currentLevel(10, 10, false, [] as never)).toBe(1)
    expect(currentLevel(5, 10, false, [] as never)).toBe(0)
  })

  it('meta progressiva: maior nível cujo alvo foi atingido', () => {
    expect(currentLevel(0, 10, true, levels)).toBe(0)
    expect(currentLevel(15, 10, true, levels)).toBe(1)
    expect(currentLevel(25, 10, true, levels)).toBe(2)
    expect(currentLevel(30, 10, true, levels)).toBe(3)
    expect(currentLevel(99, 10, true, levels)).toBe(3)
  })

  it('nextLevelTarget: alvo do próximo degrau ou null no topo', () => {
    expect(nextLevelTarget(15, true, levels)).toBe(20)
    expect(nextLevelTarget(25, true, levels)).toBe(30)
    expect(nextLevelTarget(35, true, levels)).toBeNull()
    expect(nextLevelTarget(5, false, [] as never)).toBeNull()
  })
})
