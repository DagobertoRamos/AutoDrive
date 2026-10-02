import { describe, expect, it } from 'vitest'
import { CAR_KINDS, kindFromText, libraryCaption, librarySize, parseVision, randomVariant } from './caption-library-core'
import { parseProbe } from './video-core'

const loja = { storeName: 'AutoDrive', city: 'São Paulo', whatsapp: '(11) 93471-8276', instagram: 'dagobertoautodriveveiculos', site: 'www.appautodrive.com.br' }

describe('biblioteca de legendas por tipo de carro', () => {
  it('cada tipo tem 500+ legendas diferentes, com os contatos da loja e dentro do limite do Instagram', () => {
    for (const k of CAR_KINDS) {
      const n = librarySize(k)
      expect(n).toBeGreaterThanOrEqual(500)
      const all = new Set(Array.from({ length: n }, (_, i) => libraryCaption(k, i, loja)))
      expect(all.size).toBe(n)
      const one = libraryCaption(k, randomVariant(k), loja)
      expect(one).toContain('@dagobertoautodriveveiculos')
      expect(one).toContain('#autodrive')
      expect(one.length).toBeLessThanOrEqual(2200)
    }
  })

  it('superluxo não usa tom de urgência/desconto; o popular fala de economia', () => {
    const lux = Array.from({ length: librarySize('SUPERLUXO') }, (_, i) => libraryCaption('SUPERLUXO', i, loja)).join('\n')
    expect(lux).not.toMatch(/(^|[^\p{L}])(corre|acaba|desconto|promoção|barato|parcelas?)([^\p{L}]|$)/iu)
    expect(libraryCaption('DIA_A_DIA', 1, loja)).toMatch(/economia|econômico/i)
  })

  it('modelo identificado vira a 1ª linha; Story sai curto; variação dá a volta', () => {
    const t = libraryCaption('SUPERLUXO', 3, loja, { model: 'Ferrari SF90', brand: 'Ferrari' })
    expect(t.split('\n')[0]).toBe('👑 FERRARI SF90')
    expect(t).toContain('#ferrari')
    expect(libraryCaption('SUV', 0, loja, { format: 'STORY' }).split('\n').length).toBeLessThanOrEqual(3)
    expect(libraryCaption('SUV', librarySize('SUV') + 5, loja)).toBe(libraryCaption('SUV', 5, loja))
    expect(libraryCaption('SUV', -1, loja)).toBe(libraryCaption('SUV', librarySize('SUV') - 1, loja))
  })
})

describe('identificação do tipo pelo texto', () => {
  it.each([
    ['ferrari_sf90_stradale.mp4', 'SUPERLUXO'],
    ['Lamborghini Urus Performante', 'SUPERLUXO'],
    ['ROLLS-ROYCE-CULLINAN.MOV', 'SUPERLUXO'],
    ['range rover evoque 2020', 'PREMIUM'],
    ['entrega bmw x1', 'PREMIUM'],
    ['porsche 911 carrera', 'ESPORTIVO'],
    ['corolla cross hibrido', 'SUV'],
    ['corolla xei', 'SEDA'],
    ['onix plus premier', 'SEDA'],
    ['onix lt 1.0', 'DIA_A_DIA'],
    ['hilux srx', 'PICAPE'],
    ['byd dolphin mini', 'ELETRICO'],
    ['VID_20260930_1405.mp4', null],
  ])('%s → %s', (text, kind) => {
    expect(kindFromText(text)?.kind ?? null).toBe(kind)
  })

  it('só a marca no nome do arquivo: as palavras seguintes completam o modelo', () => {
    expect(kindFromText('ferrari-sf90-stradale.mp4')?.model).toBe('Ferrari SF90 Stradale')
    expect(kindFromText('VID ferrari 20260930 final.mp4')?.model).toBe('Ferrari')
    expect(kindFromText('lamborghini huracan evo 2023')?.model).toBe('Lamborghini Huracan EVO')
  })

  it('marca composta sai inteira', () => {
    expect(kindFromText('range rover sport')?.brand).toBe('Land Rover')
    expect(kindFromText('aston martin dbx')?.brand).toBe('Aston Martin')
  })
})

describe('resposta da IA de visão', () => {
  it('a tabela de marcas corrige o tipo (Ferrari é superluxo mesmo que a IA diga esportivo)', () => {
    const g = parseVision('```json\n{"veiculo": true, "categoria": "ESPORTIVO", "marca": "Ferrari", "modelo": "296 GTB", "confianca": 0.8, "cena": "carro vermelho em estúdio"}\n```')
    expect(g).toMatchObject({ kind: 'SUPERLUXO', model: 'Ferrari 296 GTB', source: 'ia', confidence: 0.8 })
  })
  it('modelo desconhecido usa a categoria da IA; sem carro → null; lixo → null', () => {
    expect(parseVision('{"veiculo": true, "categoria": "SUV", "marca": "", "modelo": "", "confianca": 0.4}')?.kind).toBe('SUV')
    expect(parseVision('{"veiculo": false}')).toBeNull()
    expect(parseVision('não sei')).toBeNull()
  })
})

describe('medidas do vídeo (saída do ffmpeg)', () => {
  it('celular gravado em pé (girado 90°) vira 1080×1920', () => {
    const out = `Duration: 00:00:12.48, start: 0.000000, bitrate: 9000 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1920x1080, 9000 kb/s, 30 fps\n    Side data:\n      displaymatrix: rotation of -90.00 degrees`
    expect(parseProbe(out)).toEqual({ width: 1080, height: 1920, duration: 12.48 })
  })
  it('vídeo deitado sem rotação; sem vídeo → null', () => {
    expect(parseProbe('Duration: 00:01:02.00,\n Stream #0:0: Video: h264, yuv420p, 1280x720 [SAR 1:1 DAR 16:9], 30 fps')).toEqual({ width: 1280, height: 720, duration: 62 })
    expect(parseProbe('Duration: 00:00:03.00\n Stream #0:0: Audio: aac')).toBeNull()
  })
})
