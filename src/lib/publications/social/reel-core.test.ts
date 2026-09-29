import { describe, expect, it } from 'vitest'
import { chainFilter, photoScenes, REEL_TIMING, reelChips, reelPlan, reelTotal, sceneFilter } from './reel-core'
import { DESIGN_STYLES, DESIGNS, VIDEO_SECONDS } from './design-styles'

const facts = { brand: 'HONDA', model: 'HONDA ADV', version: '160', year: 2024, modelYear: 2024, km: 500, gear: 'Automático', fuel: 'Flex', options: ['ABS', 'Chave presencial', 'Painel digital'], conditions: '✅ Financiamento em até 48x\n✅ Aceita troca', badge: 'OFERTA' }

describe('Reels profissionais — roteiro', () => {
  it('uma informação por cena, na ordem que importa para quem compra', () => {
    expect(reelChips(facts)).toEqual(['ANO 2024', 'SÓ 500 KM', 'CÂMBIO AUTOMÁTICO', 'FLEX', 'ABS', 'CHAVE PRESENCIAL', 'PAINEL DIGITAL', 'FINANCIAMENTO EM ATÉ 48X', 'ACEITA TROCA'])
    expect(reelChips({ year: 2021, modelYear: 2022, km: 0 })).toEqual(['ANO 2021/2022', 'ZERO KM'])
  })
  it('30 s por padrão; 40, 50 e 60 s fecham a duração pedida', () => {
    expect(reelTotal(reelPlan(12, facts))).toBeCloseTo(30, 0)
    for (const s of VIDEO_SECONDS) expect(Math.abs(reelTotal(reelPlan(12, facts, { seconds: s })) - s)).toBeLessThan(0.3)
    expect(reelTotal(reelPlan(12, facts, { seconds: 45 }))).toBeCloseTo(30, 0) // fora da lista → 30
  })
  it('ritmo calmo: cada foto fica ~3 s na tela (nada de cortes rápidos)', () => {
    for (const s of VIDEO_SECONDS) {
      const photos = reelPlan(20, facts, { seconds: s }).filter((x) => x.kind === 'photo')
      for (const p of photos) { expect(p.seconds).toBeGreaterThanOrEqual(2.9); expect(p.seconds).toBeLessThanOrEqual(3.6) }
    }
    const fast = reelPlan(20, facts, { seconds: 30, motion: 'dinamico' }).filter((x) => x.kind === 'photo')
    expect(fast.length).toBeGreaterThan(photoScenes(30))
    expect(fast[0].seconds).toBeGreaterThanOrEqual(2.4)
  })
  it('gancho → fotos com informação → preço → chamada; gancho, preço e chamada com tempo para ler', () => {
    const segs = reelPlan(15, facts)
    expect(segs[0]).toMatchObject({ kind: 'hook', photo: 0, seconds: REEL_TIMING.hook })
    expect(segs.at(-2)).toMatchObject({ kind: 'price', seconds: REEL_TIMING.price })
    expect(segs.at(-1)).toMatchObject({ kind: 'cta', seconds: REEL_TIMING.cta })
    const photos = segs.filter((s) => s.kind === 'photo')
    expect(new Set(photos.map((s) => s.photo)).size).toBe(photos.length) // fotos diferentes
    expect(photos[0].chip).toBe('ANO 2024')
  })
  it('poucas fotos: reaproveita com outro movimento e mantém a duração', () => {
    const segs = reelPlan(2, facts, { seconds: 60 })
    const photos = segs.filter((s) => s.kind === 'photo')
    expect(photos.length).toBeGreaterThan(10)
    expect(new Set(photos.map((s) => s.motion)).size).toBeGreaterThan(2)
    expect(reelTotal(segs)).toBeCloseTo(60, 0)
  })
  it('transições do modelo visual e movimento tremido no Amador', () => {
    for (const d of DESIGN_STYLES) {
      const segs = reelPlan(8, facts, { transitions: DESIGNS[d].transitions, motion: DESIGNS[d].motion })
      for (const s of segs.slice(0, -1)) expect(s.kind === 'cta' || DESIGNS[d].transitions.includes(s.transition)).toBe(true)
    }
    expect(reelPlan(8, facts, { motion: 'tremido' }).some((s) => s.motion === 'shake')).toBe(true)
  })
  it('ffmpeg: zoom no máximo 6% (o carro não é cortado) e taxa de quadros explícita', () => {
    const segs = reelPlan(4, facts)
    for (const x of segs) {
      const f = sceneFilter(x)
      expect(f).toMatch(/fps=30,settb=1\/30\[v\]$/)
      const z = /zoompan=z='([^']+)'/.exec(f)![1]
      expect(Number(z.split(/[+\-*]/)[0])).toBeLessThanOrEqual(1.06)
    }
    const g = chainFilter(segs)
    expect(g.filter.match(/xfade=/g)).toHaveLength(segs.length - 1)
    expect(g.filter.match(/settb=1\/30/g)).toHaveLength(segs.length)
    expect(g.total).toBeCloseTo(reelTotal(segs))
  })
})
