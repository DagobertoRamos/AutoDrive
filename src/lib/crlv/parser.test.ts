import { describe, it, expect } from 'vitest'
import {
  validatePlate,
  validateChassis,
  validateRenavam,
  reconstructVisualText,
  parseCrlvText,
  buildExtractedField,
} from './parser'

describe('CRLV Parser & Consensus', () => {
  describe('validatePlate', () => {
    it('should validate old format plates', () => {
      expect(validatePlate('ABC1234')).toBe(true)
      expect(validatePlate('ABC-1234')).toBe(true)
      expect(validatePlate('ABC123')).toBe(false)
    })

    it('should validate Mercosul plates', () => {
      expect(validatePlate('ABC1D23')).toBe(true)
      expect(validatePlate('ABC-1D23')).toBe(true)
    })
  })

  describe('validateChassis', () => {
    it('should validate 17-character VINs', () => {
      expect(validateChassis('9BWZZZ377VT004251')).toBe(true)
      expect(validateChassis('9BWZZZ377VT00425')).toBe(false) // short
      expect(validateChassis('9BWZZZ377VT0042512')).toBe(false) // long
      expect(validateChassis('9BWZZZ377VT0O4251')).toBe(false) // contains 'O'
    })
  })

  describe('validateRenavam', () => {
    it('should validate real/valid Renavam numbers', () => {
      // Renavam 11 dígitos válido (exemplo gerado que passa no mod11)
      expect(validateRenavam('33580556278')).toBe(true)
      expect(validateRenavam('11111111111')).toBe(false) // todos iguais
    })
  })

  describe('reconstructVisualText', () => {
    it('should sort PDF text items by Y and then X', () => {
      const items = [
        { str: 'VAL2', transform: [1, 0, 0, 1, 100, 500] },
        { str: 'VAL1', transform: [1, 0, 0, 1, 50, 500] },
        { str: 'VAL3', transform: [1, 0, 0, 1, 50, 480] },
      ]
      const text = reconstructVisualText(items)
      expect(text).toBe('VAL1 VAL2\nVAL3')
    })
  })

  describe('parseCrlvText', () => {
    it('should extract correct fields from mock text', () => {
      const text = `
        PLACA: ABC-1D23 CHASSI: 9BWZZZ377VT004251
        RENAVAM: 33580556278 ANO FAB/MOD: 2023/2024
        MARCA/MODELO/VERSAO: VW/NIVUS HL TSI AD
        COR: CINZA COMBUSTIVEL: FLEX
        POTENCIA/CILINDRADA: 116 CV/999
        ESPÉCIE/TIPO: PASSAGEIRO AUTOMOVEL
      `
      const extracted = parseCrlvText(text)
      expect(extracted.plate).toBe('ABC1D23')
      expect(extracted.chassis).toBe('9BWZZZ377VT004251')
      expect(extracted.renavam).toBe('33580556278')
      expect(extracted.manufactureYear).toBe(2023)
      expect(extracted.modelYear).toBe(2024)
      expect(extracted.brand).toBe('VW')
      expect(extracted.model).toBe('NIVUS')
      expect(extracted.version).toBe('HL TSI AD')
      expect(extracted.color).toBe('CINZA')
      expect(extracted.fuelType).toBe('FLEX')
      expect(extracted.powerCv).toBe(116)
      expect(extracted.displacementCc).toBe(999)
      expect(extracted.officialSpeciesType).toBe('PASSAGEIRO AUTOMOVEL')
    })
  })

  describe('buildExtractedField', () => {
    it('should compute consensus and high confidence on exact match', () => {
      const field = buildExtractedField('plate', 'ABC1D23', 'ABC1D23', 'NATIVE_PDF_TEXT')
      expect(field.validationStatus).toBe('VALID')
      expect(field.confidence).toBe(1.0)
      expect(field.requiresReview).toBe(false)
      expect(field.source).toBe('NATIVE_PDF_TEXT')
    })

    it('should mark conflict and set lower confidence on mismatch', () => {
      const field = buildExtractedField('plate', 'ABC1D23', 'ABC1D24', 'NATIVE_PDF_TEXT')
      expect(field.validationStatus).toBe('CONFLICT')
      expect(field.confidence).toBe(0.6)
      expect(field.requiresReview).toBe(true)
    })
  })
})
