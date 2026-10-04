import { describe, expect, it } from 'vitest'
import { limitDesigns, maxDesignsFor, variantFor } from './variety-core'

describe('variedade dos posts em lote', () => {
  it('modelo sorteado só entre os escolhidos; chamada e música variam com "Variar"', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `car${i}:r1`)
    const vs = seeds.map((s) => variantFor(s, { designs: ['TELEJORNAL', 'LUXO'], template: 'CHEGOU', vary: true, music: { mode: 'AUTO', mood: 'ANIMADA' } }))
    expect(new Set(vs.map((v) => v.design))).toEqual(new Set(['TELEJORNAL', 'LUXO']))
    expect(new Set(vs.map((v) => v.template)).size).toBeGreaterThan(2)
    expect(new Set(vs.map((v) => (v.music?.mode === 'AUTO' ? v.music.mood : null))).size).toBeGreaterThan(2)
    // Estável: a mesma semente dá o mesmo resultado (prévia = envio).
    expect(variantFor('car3:r1', { designs: ['TELEJORNAL', 'LUXO'], template: 'CHEGOU', vary: true, music: { mode: 'AUTO', mood: 'ANIMADA' } })).toEqual(vs[3])
  })
  it('sem "Variar": chamada e música escolhidas valem para todos; faixa escolhida nunca é trocada', () => {
    const track = { mode: 'TRACK' as const, source: 'FREESOUND' as const, id: '9' }
    const v = variantFor('x', { designs: ['CLASSICO'], template: 'OFERTA', vary: false, music: track })
    expect(v).toEqual({ design: 'CLASSICO', template: 'OFERTA', music: track })
    expect(variantFor('y', { designs: [], template: 'OFERTA', vary: true, music: track }).music).toEqual(track)
  })
  it('limite de modelos: 1 carro = 1; lote = até um por carro; o mais antigo sai', () => {
    expect(maxDesignsFor(1)).toBe(1); expect(maxDesignsFor(5)).toBe(5); expect(maxDesignsFor(28)).toBe(12)
    expect(limitDesigns(['CLASSICO', 'LUXO', 'FEIRAO'], 2)).toEqual(['LUXO', 'FEIRAO'])
    expect(limitDesigns(['LUXO', 'LUXO'], 3)).toEqual(['LUXO'])
  })
  it('lote: cada modelo escolhido aparece por igual entre os vídeos', () => {
    const input = { designs: ['TELEJORNAL', 'LUXO', 'FEIRAO', 'REVISTA'] as const, template: 'CHEGOU' as const, vary: true, music: null }
    const used = Array.from({ length: 12 }, (_, i) => variantFor(`c${i}`, { ...input, designs: [...input.designs] }, i, 'rodada1').design)
    for (const d of input.designs) expect(used.filter((x) => x === d)).toHaveLength(3)
  })
})
