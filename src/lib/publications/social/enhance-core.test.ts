import { describe, expect, it } from 'vitest'
import { enhancePlan, photoStats } from './enhance-core'

const fill = (r: number, g: number, b: number, n = 100) => Uint8Array.from({ length: n * 3 }, (_, i) => [r, g, b][i % 3])

describe('Tratamento automático das fotos', () => {
  it('mede luz, faixa tonal e saturação', () => {
    const s = photoStats(fill(40, 40, 40))
    expect(Math.round(s.mean)).toBe(40); expect(s.p2).toBe(40); expect(s.p98).toBe(40); expect(s.sat).toBe(0)
  })
  it('foto muito escura: clareia, recupera sombras e estica os tons', () => {
    const p = enhancePlan({ mean: 46, p2: 5, p98: 150, sat: 0.2 })
    expect(p.gamma).toBeLessThan(0.8); expect(p.clahe).toBeGreaterThan(0); expect(p.stretch).toBe(true); expect(p.brightness).toBeGreaterThan(1)
    expect(p.label).toContain('muito escura')
  })
  it('foto bem iluminada NÃO é escurecida nem recebe contraste local', () => {
    const p = enhancePlan({ mean: 166, p2: 20, p98: 250, sat: 0.2 })
    expect(p.brightness).toBe(1); expect(p.clahe).toBe(0); expect(p.gamma).toBe(1)
  })
  it('foto estourada é levemente escurecida', () => {
    expect(enhancePlan({ mean: 215, p2: 90, p98: 255, sat: 0.1 }).brightness).toBeLessThan(1)
  })
  it('cor apagada ganha saturação; foto já saturada não', () => {
    expect(enhancePlan({ mean: 120, p2: 5, p98: 250, sat: 0.1 }).saturation).toBeGreaterThan(1.1)
    expect(enhancePlan({ mean: 120, p2: 5, p98: 250, sat: 0.7 }).saturation).toBe(1)
  })
})
