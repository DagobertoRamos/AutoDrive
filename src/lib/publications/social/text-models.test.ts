import { describe, expect, it } from 'vitest'
import { DESC_STYLES, descriptionTemplate, TERMS_STYLES, termsBlock, EMPTY_TERMS, type TextInput } from './text-core'
import { CAPTION_TONES, fallbackCaption } from './caption-core'

const car: TextInput = {
  brand: 'Jeep', model: 'Compass', version: 'Longitude 2.0', year: 2021, modelYear: 2022, km: 45300, gear: 'Automático', fuel: 'Flex', color: 'Preto',
  engine: null, doors: 4, vehicleType: 'CAR', bodyType: 'SUV', isNew: false, price: 119900, oldPrice: 124900, options: ['Teto solar', 'Câmera de ré', 'Central multimídia'],
  terms: { ...EMPTY_TERMS, cash: true, financing: true, financingMax: 60, acceptsTrade: true }, inspected: true, origin: 'OWN', storeName: 'AutoDrive', city: 'Barueri', seed: 'x',
} as TextInput

describe('Modelos de texto sem IA (pelo menos 5 de cada)', () => {
  it('descrição: 6 modelos, todos diferentes e só com os fatos do carro', () => {
    expect(DESC_STYLES.length).toBeGreaterThanOrEqual(5)
    const texts = DESC_STYLES.map((s) => descriptionTemplate(car, s))
    expect(new Set(texts).size).toBe(texts.length)
    for (const t of texts) { expect(t).toMatch(/Compass/i); expect(t).not.toMatch(/único dono|revisões em dia/i); expect(t.length).toBeGreaterThan(150) }
  })
  it('condições comerciais: 5 modelos, com os avisos de crédito quando há financiamento', () => {
    expect(TERMS_STYLES.length).toBeGreaterThanOrEqual(5)
    const texts = TERMS_STYLES.map((s) => termsBlock({ terms: car.terms, inspected: true, storeName: 'AutoDrive' }, s))
    expect(new Set(texts).size).toBe(texts.length)
    for (const t of texts) { expect(t).toMatch(/60x/i); expect(t).toMatch(/troca/i); expect(t).toMatch(/aprovação|análise/i); expect(t).not.toMatch(/consórcio/i) }
  })
  it('legenda: 5 tons, cada um com abertura e fechamento próprios', () => {
    expect(CAPTION_TONES.length).toBeGreaterThanOrEqual(5)
    const texts = CAPTION_TONES.map((tone) => fallbackCaption({ format: 'POST', tone, brand: 'Jeep', model: 'Compass', version: 'Longitude', year: 2022, modelYear: 2022, km: 45300, gear: 'Automático', fuel: 'Flex', price: 119900, options: ['Teto solar'], storeName: 'AutoDrive', whatsapp: '(11) 93471-8276' }))
    expect(new Set(texts.map((t) => t.split('\n')[0])).size).toBe(texts.length)
    for (const t of texts) expect(t).toMatch(/93471-8276/)
  })
})
