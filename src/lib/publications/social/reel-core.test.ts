import { describe, expect, it } from 'vitest'
import { REEL_TIMING, reelChips, reelGraph, reelPlan, reelTotal } from './reel-core'

const facts = { brand: 'HONDA', model: 'HONDA ADV', version: '160', year: 2024, modelYear: 2024, km: 500, gear: 'Automático', fuel: 'Flex', options: ['ABS', 'Chave presencial', 'Painel digital'], conditions: '✅ Financiamento em até 48x\n✅ Aceita troca', badge: 'OFERTA' }

describe('Reels que prendem a atenção — roteiro', () => {
  it('uma informação por cena, na ordem que importa para quem compra', () => {
    expect(reelChips(facts)).toEqual(['ANO 2024', 'SÓ 500 KM', 'CÂMBIO AUTOMÁTICO', 'FLEX', 'ABS', 'CHAVE PRESENCIAL', 'PAINEL DIGITAL', 'FINANCIAMENTO EM ATÉ 48X', 'ACEITA TROCA'])
    expect(reelChips({ year: 2021, modelYear: 2022, km: 0 })).toEqual(['ANO 2021/2022', 'ZERO KM'])
  })
  it('gancho → até 12 fotos em cortes rápidos → preço → chamada; entre ~12 e ~25 s', () => {
    const segs = reelPlan(15, facts)
    expect(segs[0]).toMatchObject({ kind: 'hook', photo: 0 })
    expect(segs.at(-2)!.kind).toBe('price'); expect(segs.at(-1)!.kind).toBe('cta')
    const photos = segs.filter((s) => s.kind === 'photo')
    expect(photos).toHaveLength(REEL_TIMING.maxPhotos - 1)
    expect(new Set(photos.map((s) => s.photo)).size).toBe(11) // todas as fotos diferentes
    expect(new Set(photos.map((s) => s.motion)).size).toBeGreaterThan(2) // movimento variado
    expect(photos[0].chip).toBe('ANO 2024')
    const t = reelTotal(segs); expect(t).toBeGreaterThan(12); expect(t).toBeLessThan(25)
  })
  it('poucas fotos: reaproveita com outro movimento para manter o ritmo', () => {
    const segs = reelPlan(2, facts)
    expect(segs.filter((s) => s.kind === 'photo').length).toBeGreaterThanOrEqual(3)
    expect(reelTotal(segs)).toBeGreaterThan(9)
  })
  it('filtro do ffmpeg: 2 entradas por cena (imagem + texto), transições encadeadas', () => {
    const segs = reelPlan(4, facts)
    const g = reelGraph(segs)
    expect(g.filter.match(/xfade=/g)).toHaveLength(segs.length - 1)
    expect(g.filter).toContain(`[${2 * (segs.length - 1) + 1}:v]`)
    expect(g.filter).toContain("crop=720:1280:x='(iw-720)*min(1,t/")
    expect(g.filter).toContain('zoompan=')
    expect(g.total).toBeCloseTo(reelTotal(segs))
  })
})
