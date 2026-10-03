import { describe, expect, it } from 'vitest'
import { limitDesigns, variantFor } from './variety-core'

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
  it('até 2 modelos: o mais antigo sai', () => {
    expect(limitDesigns(['CLASSICO', 'LUXO', 'FEIRAO'])).toEqual(['LUXO', 'FEIRAO'])
    expect(limitDesigns(['LUXO', 'LUXO'])).toEqual(['LUXO'])
  })
})
