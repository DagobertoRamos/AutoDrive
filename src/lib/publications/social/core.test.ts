import { describe, expect, it } from 'vitest'
import { artLayout, ellipsize, factsLine, fitSize, safeColor } from './art-core'
import { captionPrompt, fallbackCaption, finishCaption, hashtags, type CaptionInput } from './caption-core'
import { autoPlan, campaignKeyFor, canvasSize, formatsFor, planLocal, socialOf } from './formats'
import { reelFilter } from './reel'

describe('formatos e piloto automático', () => {
  it('lê o formato gravado na publicação e ignora lixo', () => {
    expect(socialOf({ social: { format: 'REELS', template: 'CHEGOU' } })).toEqual({ format: 'REELS', template: 'CHEGOU' })
    expect(socialOf({ social: { format: 'REELS', template: 'xx' } })).toEqual({ format: 'REELS', template: 'OFERTA' })
    expect(socialOf({ social: { format: 'TIKTOK' } })).toBeNull()
    expect(socialOf(null)).toBeNull()
  })
  it('Post/Carrossel são únicos; Story/Reels ganham a data (um por dia)', () => {
    expect(campaignKeyFor('POST', '2026-09-27T12:00')).toBe('post')
    expect(campaignKeyFor('CARROSSEL')).toBe('carrossel')
    expect(campaignKeyFor('STORY', '2026-09-27T12:05')).toBe('story-2026-09-27')
    expect(campaignKeyFor('REELS', '2026-09-28T19:00')).toBe('reels-2026-09-28')
  })
  it('só Instagram e Página do Facebook têm formatos', () => {
    expect(formatsFor('INSTAGRAM')).toHaveLength(4)
    expect(formatsFor('WEBMOTORS')).toEqual([])
  })
  it('espalha nos horários de pico a partir da hora local', () => {
    expect(autoPlan(['POST', 'STORY', 'REELS', 'CARROSSEL'], 9)).toEqual([
      { format: 'POST', dayOffset: 0, time: '12:00' }, { format: 'STORY', dayOffset: 0, time: '12:05' },
      { format: 'REELS', dayOffset: 0, time: '19:00' }, { format: 'CARROSSEL', dayOffset: 2, time: '12:00' },
    ])
    // Depois das 19 h: tudo vai para o dia seguinte.
    expect(planLocal('2026-09-30T21:30', ['POST', 'REELS'])).toEqual([
      { format: 'POST', local: '2026-10-01T12:00' }, { format: 'REELS', local: '2026-10-01T19:00' },
    ])
    // Entre 12 h e 19 h: post às 19 h e Reels no pico seguinte (amanhã 12 h).
    expect(planLocal('2026-09-27T15:00', ['POST', 'REELS'])).toEqual([
      { format: 'POST', local: '2026-09-27T19:00' }, { format: 'REELS', local: '2026-09-28T12:00' },
    ])
  })
  it('tamanhos oficiais: feed 4:5 e vertical 9:16', () => {
    expect(canvasSize('POST')).toEqual({ w: 1080, h: 1350 })
    expect(canvasSize('STORY')).toEqual({ w: 1080, h: 1920 })
    expect(canvasSize('REELS', true)).toEqual({ w: 720, h: 1280 })
  })
})

describe('layout da arte', () => {
  const base = { storeName: 'Loja', brand: 'Volkswagen', model: 'Tiguan', version: '2.0 TSI', year: 2011, modelYear: 2011, km: 160276, gear: 'Automático', price: 43000 }
  it('texto sempre dentro do quadro e acima da borda de baixo', () => {
    for (const format of ['POST', 'STORY', 'REELS'] as const) {
      const l = artLayout({ ...base, format, template: 'OFERTA', forVideo: format === 'REELS' })
      for (const t of l.texts) {
        expect(t.y).toBeGreaterThanOrEqual(0)
        expect(t.y + t.size).toBeLessThanOrEqual(l.h)
      }
      expect(l.texts.some((t) => t.text === 'R$ 43.000')).toBe(true)
    }
  })
  it('modelo LIMPA não tem selo; cores inválidas caem no padrão', () => {
    expect(artLayout({ ...base, format: 'POST', template: 'LIMPA' }).shapes.filter((s) => s.kind === 'pill')).toHaveLength(0)
    expect(safeColor('red; background:url(x)', '#000000')).toBe('#000000')
  })
  it('título longo encolhe e, no limite, ganha reticências', () => {
    const long = 'Mercedes-Benz Classe GLE 400d 4MATIC Coupé Launch Edition'
    expect(fitSize(long, 900, 80, 46, true)).toBe(46)
    expect(ellipsize(long, 400, 46, true).endsWith('…')).toBe(true)
    expect(factsLine({ year: 2020, modelYear: 2021, km: 0, gear: 'Manual' })).toBe('2020/2021  •  0 km  •  Manual')
  })
  it('filtro do Reels encadeia os fades nos tempos certos', () => {
    const f = reelFilter([2.6, 2.6, 3.2])
    expect(f.filter).toContain('xfade=transition=fade:duration=0.5:offset=2.100')
    expect(f.filter).toContain('offset=4.200[vout]')
    expect(f.total).toBeCloseTo(7.4)
  })
})

describe('legendas', () => {
  const i: CaptionInput = { format: 'POST', tone: 'VENDEDOR', brand: 'Volkswagen', model: 'Tiguan', version: '2.0 TSI', year: 2011, modelYear: 2011, km: 160276, gear: 'Automático', price: 43000, oldPrice: 46900, options: ['Teto solar', 'Couro'], storeName: 'AutoDrive Veículos', city: 'Barueri', whatsapp: '(11) 93471-8276', instagram: 'dagobertoautodriveveiculos' }
  it('pedido à IA leva só os fatos e proíbe inventar', () => {
    const p = captionPrompt(i)
    expect(p).toContain('Opcionais (use só estes): Teto solar, Couro')
    expect(p).toMatch(/não invente opcionais, garantia/)
    expect(captionPrompt({ ...i, options: [] })).toContain('não informados (não cite nenhum)')
  })
  it('resposta da IA: tira markdown e hashtags inventadas, põe contatos e hashtags da loja', () => {
    const out = finishCaption('**Tiguan impecável!** #barato #top\nChama no zap', i)
    expect(out).not.toContain('**')
    expect(out).not.toContain('#barato')
    expect(out).toContain('📲 WhatsApp: (11) 93471-8276')
    expect(out).toContain('📸 @dagobertoautodriveveiculos')
    expect(out).toContain('#volkswagentiguan')
    expect(out).toContain('#carrosbarueri')
    expect(finishCaption('x'.repeat(5000), i).length).toBeLessThanOrEqual(2200)
  })
  it('sem IA: legenda de reserva com preço de/por e sem hashtag no Story', () => {
    const post = fallbackCaption(i)
    expect(post).toContain('De R$ 46.900 por R$ 43.000')
    expect(post).toContain('Teto solar')
    const story = fallbackCaption({ ...i, format: 'STORY' })
    expect(story).not.toContain('#')
    expect(hashtags(i).length).toBeLessThanOrEqual(8)
  })
})
