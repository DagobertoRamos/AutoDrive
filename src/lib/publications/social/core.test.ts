import { describe, expect, it } from 'vitest'
import { artLayout, ellipsize, factsLine, fitSize, safeColor } from './art-core'
import { captionPrompt, fallbackCaption, finishCaption, hashtags, type CaptionInput } from './caption-core'
import { autoPlan, campaignKeyFor, canvasSize, formatsFor, planLocal, socialOf } from './formats'
import { reelFilter } from './reel'
import * as m from './music-core'

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
    expect(formatsFor('INSTAGRAM')).toHaveLength(5)
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

describe('trilha sonora (regras)', () => {
  it('busca no Freesound: só CC0, só música, 20 s a 4 min', () => {
    const q = m.freesoundQuery({ mood: 'TRANQUILA' })
    expect(q.get('filter')).toBe('license:"Creative Commons 0" duration:[20 TO 240] tag:music')
    expect(q.get('query')).toBe('chill ambient music')
    expect(m.freesoundQuery({ q: 'piano' }).get('sort')).toBe('score')
  })
  it('descarta faixa que não for CC0 mesmo se a busca devolver', () => {
    const tracks = m.parseFreesound({ results: [
      { id: 1, name: 'Loop.wav', username: 'a', duration: 30, license: 'http://creativecommons.org/publicdomain/zero/1.0/', previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/1.mp3' } },
      { id: 2, name: 'Outra', username: 'b', duration: 30, license: 'http://creativecommons.org/licenses/by/4.0/', previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/2.mp3' } },
    ] })
    expect(tracks.map((t) => t.id)).toEqual(['1'])
    expect(tracks[0].title).toBe('Loop')
  })
  it('biblioteca do Instagram: lê audio_id, artista e duração', () => {
    expect(m.parseIgAudio({ data: [{ audio_id: '99', title: 'Hit', display_artist: 'Banda', duration_in_ms: 31000, download_url: 'https://x/p.mp3' }] })[0]).toMatchObject({ source: 'IG', id: '99', seconds: 31, artist: 'Banda' })
  })
  it('automática: mesmo carro = mesma faixa; lista vazia = sem faixa', () => {
    const list = [1, 2, 3, 4].map((n) => ({ source: 'FREESOUND' as const, id: String(n), title: '', artist: '', seconds: 30, previewUrl: '', license: '' }))
    expect(m.pickTrack(list, 'carro-a')).toEqual(m.pickTrack(list, 'carro-a'))
    expect(m.pickTrack([], 'x')).toBeNull()
  })
  it('onde a música entra: biblioteca só em Reels/Post do Instagram; carrossel do Facebook sem música', () => {
    const ig = { mode: 'TRACK' as const, source: 'IG' as const, id: '1' }
    const auto = { mode: 'AUTO' as const, mood: 'ANIMADA' as const }
    expect(m.musicPlan(ig, 'INSTAGRAM', 'REELS')).toBe('IG_LIBRARY')
    expect(m.musicPlan(ig, 'INSTAGRAM', 'POST')).toBe('IG_LIBRARY')
    expect(m.musicPlan(ig, 'INSTAGRAM', 'STORY')).toBe('EMBED')
    expect(m.musicPlan(ig, 'META_PAGE', 'REELS')).toBe('EMBED')
    expect(m.musicPlan(auto, 'META_PAGE', 'CARROSSEL')).toBeNull()
    expect(m.musicPlan(null, 'INSTAGRAM', 'REELS')).toBeNull()
  })
  it('lê a escolha gravada e recusa id estranho', () => {
    expect(m.musicOf({ mode: 'AUTO', mood: 'ROCK' })).toEqual({ mode: 'AUTO', mood: 'ROCK' })
    expect(m.musicOf({ mode: 'TRACK', source: 'IG', id: '1;DROP' })).toBeNull()
    expect(socialOf({ social: { format: 'REELS', template: 'OFERTA', music: { mode: 'AUTO', mood: 'X' } } })?.music).toEqual({ mode: 'AUTO', mood: 'ANIMADA' })
  })
  it('fade de saída termina junto com o vídeo', () => {
    expect(m.audioFilter(10)).toBe('volume=0.85,afade=t=in:st=0:d=0.6,afade=t=out:st=8.50:d=1.5')
  })
})

describe('textos do anúncio (modelos e condições)', () => {
  const now = new Date('2026-09-27T12:00:00Z')
  const i = {
    brand: 'Volkswagen', model: 'Tiguan', version: '2.0 TSI', year: 2020, modelYear: 2021, km: 30000, gear: 'Automático', fuel: 'Flex', color: 'Prata', doors: 4, engine: null,
    price: 99900, oldPrice: 104900, options: ['Teto solar', 'Couro'], origin: 'OWN' as const, inspected: true, isNew: false, storeName: 'AutoDrive', city: 'Barueri',
    terms: { cash: false, financingMax: 60, cardsMax: null, consortium: false, acceptsTrade: true, financing: true, cards: false, transferIncluded: false, ipvaPaid: true, warrantyMonths: 3, extra: '' },
  }
  it('destaques só com o que dá para afirmar pelos dados', async () => {
    const t = await import('./text-core')
    expect(t.highlights(i, now)).toEqual(['baixa quilometragem para o ano', 'laudo cautelar aprovado', 'câmbio automático', 'preço reduzido (de R$ 104.900 por R$ 99.900)'])
    expect(t.highlights({ ...i, km: 200000, inspected: false, gear: 'Manual', oldPrice: null }, now)).toEqual([])
  })
  it('condições saem da configuração da loja + laudo da ficha; nada configurado = vazio', async () => {
    const t = await import('./text-core')
    expect(t.termsText(i, 'LISTA').split('\n')).toEqual(['✔ Financiamento em até 60x (sujeito à aprovação de crédito)', '✔ Aceitamos seu veículo na troca', '✔ IPVA pago', '✔ Garantia de 3 meses (conforme termo da loja)', '✔ Laudo cautelar aprovado'])
    expect(t.termsText({ terms: t.EMPTY_TERMS, inspected: false })).toBe('')
  })
  it('3 modelos prontos; opcionais só os cadastrados; sem opcional, não cita', async () => {
    const t = await import('./text-core')
    for (const st of t.DESC_STYLES) {
      const d = t.descriptionTemplate(i, st, now)
      expect(d).toContain('Tiguan')
      expect(d).toContain('Teto solar')
      expect(d).not.toMatch(/único dono|revisad/i)
    }
    expect(t.descriptionTemplate({ ...i, options: [] }, 'COMPLETO', now)).not.toContain('Opcionais')
    expect(t.descriptionTemplate({ ...i, terms: t.EMPTY_TERMS, inspected: false }, 'COMPLETO', now)).not.toContain('Condições')
  })
  it('pedido à IA: só fatos e condições exatas; resposta limpa de markdown e telefone', async () => {
    const t = await import('./text-core')
    const p = t.descriptionPrompt(i, 'EMOCIONAL', now)
    expect(p).toContain('Opcionais (use só estes): Teto solar, Couro')
    expect(p).toContain('Condições da loja (use exatamente): Financiamento em até 60x')
    expect(t.descriptionPrompt({ ...i, terms: t.EMPTY_TERMS, inspected: false }, 'DIRETO', now)).toContain('não informadas (não cite nenhuma)')
    expect(t.finishDescription('**Linda** Tiguan\nLigue (11) 93471-8276')).toBe('Linda Tiguan\nLigue')
  })
  it('configuração das condições: limpa e limita', async () => {
    const t = await import('./text-core')
    expect(t.sanitizeTerms({ acceptsTrade: true, warrantyMonths: 999, extra: ' x '.repeat(200) })).toMatchObject({ acceptsTrade: true, warrantyMonths: null })
    expect(t.sanitizeTerms({ extra: 'a'.repeat(500) }).extra.length).toBe(300)
  })
})

describe('programação automática (grade + rodízio)', () => {
  it('horários das próximas 48 h, só no futuro (margem 10 min), nos dias marcados', async () => {
    const a = await import('./autoprog-core')
    // 2026-09-27 é domingo (0).
    const occ = a.upcoming([{ days: [0, 1], time: '12:00', format: 'POST' }, { days: [1], time: '19:00', format: 'REELS' }], '2026-09-27T11:55', 48)
    expect(occ).toEqual([
      { local: '2026-09-28T12:00', format: 'POST' },
      { local: '2026-09-28T19:00', format: 'REELS' },
    ])
    expect(a.autoKey('REELS', '2026-09-28T19:00')).toBe('auto-reels-2026-09-28-1900')
  })
  it('rodízio: nunca postado primeiro, depois o mais antigo; promoção na frente; sem repetir no dia', async () => {
    const a = await import('./autoprog-core')
    const d = (s: string) => new Date(s)
    const cands = [
      { id: 'velho', lastPostedAt: d('2026-09-01T12:00Z'), promo: false, createdAt: d('2026-01-01') },
      { id: 'recente', lastPostedAt: d('2026-09-26T12:00Z'), promo: false, createdAt: d('2026-01-01') },
      { id: 'nunca', lastPostedAt: null, promo: false, createdAt: d('2026-09-20') },
      { id: 'promo', lastPostedAt: d('2026-09-10T12:00Z'), promo: true, createdAt: d('2026-01-01') },
    ]
    const slots = [{ local: '2026-09-28T09:00', format: 'STORY' as const }, { local: '2026-09-28T12:00', format: 'POST' as const }, { local: '2026-09-28T19:00', format: 'REELS' as const }]
    expect(a.assign(slots, cands, { promoFirst: true, minDaysBetween: 7, now: d('2026-09-27T12:00Z') }).map((x) => x.vehicleId)).toEqual(['promo', 'nunca', 'velho'])
    expect(a.assign(slots, cands, { promoFirst: false, minDaysBetween: 7, now: d('2026-09-27T12:00Z') }).map((x) => x.vehicleId)).toEqual(['nunca', 'velho', 'promo'])
    // "recente" apareceu há 2 dias: fica fora com intervalo de 7 dias.
    expect(a.assign(slots, cands, { promoFirst: false, minDaysBetween: 7, now: d('2026-09-27T12:00Z') }).some((x) => x.vehicleId === 'recente')).toBe(false)
  })
  it('configuração: descarta horário inválido, limita e mantém padrão', async () => {
    const a = await import('./autoprog-core')
    const p = a.sanitizeProgram({ enabled: true, slots: [{ days: [9, 1, 1], time: '25:00', format: 'POST' }, { days: [1, 3], time: '08:30', format: 'STORY' }], minDaysBetween: 999 })
    expect(p.slots).toEqual([{ days: [1, 3], time: '08:30', format: 'STORY' }])
    expect(p.minDaysBetween).toBe(7)
    expect(a.sanitizeProgram(undefined)).toEqual(a.DEFAULT_PROGRAM)
  })
})

describe('vídeo do carro (links)', () => {
  it('classifica: YouTube toca no site mas não baixa; Drive/Dropbox/mp4 baixam', async () => {
    const v = await import('./video-core')
    expect(v.classifyVideo('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ kind: 'YOUTUBE', downloadUrl: null, siteUrl: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(v.classifyVideo('https://www.tiktok.com/@loja/video/123')).toMatchObject({ kind: 'TIKTOK', downloadUrl: null, siteUrl: null })
    expect(v.classifyVideo('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')?.downloadUrl).toBe('https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOp&export=download&confirm=t')
    expect(v.classifyVideo('https://www.dropbox.com/s/abc/carro.mp4?dl=0')?.downloadUrl).toBe('https://www.dropbox.com/s/abc/carro.mp4?raw=1')
    expect(v.classifyVideo('https://cdn.loja.com/carro.mov')).toMatchObject({ kind: 'ARQUIVO', siteUrl: null })
    expect(v.classifyVideo('http://inseguro.com/a.mp4')).toBeNull()
    expect(v.classifyVideo('https://exemplo.com/pagina')).toBeNull()
  })
  it('formato "Vídeo do carro" mantém o áudio original (sem trilha)', async () => {
    const m = await import('./music-core')
    expect(m.musicPlan({ mode: 'AUTO', mood: 'ANIMADA' }, 'INSTAGRAM', 'VIDEO')).toBeNull()
  })
})

describe('rodízio com vídeo do carro', () => {
  it('horário "Vídeo do carro" só pega carro com vídeo que dá para baixar', async () => {
    const a = await import('./autoprog-core')
    const d = new Date('2026-01-01')
    const cands = [{ id: 'sem', lastPostedAt: null, promo: false, createdAt: d }, { id: 'com', lastPostedAt: null, promo: false, createdAt: d, hasVideo: true }]
    expect(a.assign([{ local: '2026-09-28T19:00', format: 'VIDEO' }], cands, { promoFirst: false, minDaysBetween: 0, now: d }).map((x) => x.vehicleId)).toEqual(['com'])
    expect(a.assign([{ local: '2026-09-28T19:00', format: 'VIDEO' }], [cands[0]], { promoFirst: false, minDaysBetween: 0, now: d })).toEqual([])
  })
})

describe('condições comerciais (bloco completo)', () => {
  it('só as formas marcadas, com avisos obrigatórios; nada marcado e sem laudo = vazio', async () => {
    const t = await import('./text-core')
    const b = t.termsBlock({ terms: { ...t.EMPTY_TERMS, cash: true, financing: true, financingMax: 60, cards: true, cardsMax: 24, consortium: true, acceptsTrade: true }, inspected: false, storeName: 'AutoDrive Veículos' })
    for (const x of ['💰 À VISTA', '🏦 FINANCIAMENTO EM ATÉ 60X', 'Sujeito à análise e aprovação de crédito', '💳 CARTÃO DE CRÉDITO EM ATÉ 24X', '🎯 CONSÓRCIO', 'sem garantia de prazo', '🔄 ACEITAMOS SEU VEÍCULO NA TROCA', '📌 Prazos e condições variam', 'Na AutoDrive Veículos']) expect(b).toContain(x)
    expect(b).not.toMatch(/whatsapp|@/i)
    const so = t.termsBlock({ terms: { ...t.EMPTY_TERMS, cash: true }, inspected: false, storeName: 'Loja' })
    expect(so).not.toContain('FINANCIAMENTO'); expect(so).not.toContain('📌')
    expect(t.termsBlock({ terms: t.EMPTY_TERMS, inspected: false, storeName: 'Loja' })).toBe('')
    expect(t.sanitizeTerms({ financingMax: 500, cardsMax: 12 })).toMatchObject({ financingMax: null, cardsMax: 12 })
  })
})
