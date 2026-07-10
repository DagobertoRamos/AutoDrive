import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  classifyVehicleCategory,
  getEngineCommercialLabel,
  resolveTransmissionType,
} from './deterministic'

describe('Deterministic Processing - CRLV', () => {
  describe('normalizeText', () => {
    it('should remove accents and transform to uppercase', () => {
      expect(normalizeText('VW/Nivus HL TSI AD')).toBe('VW/NIVUS HL TSI AD')
      expect(normalizeText('Caminhão')).toBe('CAMINHAO')
      expect(normalizeText('Veículo')).toBe('VEICULO')
      expect(normalizeText(null)).toBe('')
    })
  })

  describe('classifyVehicleCategory', () => {
    it('should classify AUTOMOVEL as CAR', () => {
      expect(classifyVehicleCategory('PASSAGEIRO AUTOMOVEL', null)).toBe('CAR')
      expect(classifyVehicleCategory(null, 'SUV')).toBe('CAR')
    })

    it('should classify MOTOCICLETA as MOTORCYCLE', () => {
      expect(classifyVehicleCategory('MOTOCICLETA', null)).toBe('MOTORCYCLE')
      expect(classifyVehicleCategory(null, 'MOTONETA')).toBe('MOTORCYCLE')
    })

    it('should classify CAMINHAO as TRUCK', () => {
      expect(classifyVehicleCategory('CAMINHAO TRATOR', null)).toBe('TRUCK')
    })

    it('should handle custom mappings', () => {
      const custom = { 'ESPECIAL': 'TRUCK' }
      expect(classifyVehicleCategory('ESPECIAL', null, custom)).toBe('TRUCK')
    })

    it('should fall back to UNKNOWN for other types', () => {
      expect(classifyVehicleCategory('MAQUINA AGRICOLA', 'OUTRO')).toBe('UNKNOWN')
    })
  })

  describe('getEngineCommercialLabel', () => {
    it('should suggest correct engine commercial labels', () => {
      expect(getEngineCommercialLabel(999)).toEqual({ label: '1.0', requiresReview: true })
      expect(getEngineCommercialLabel(1598)).toEqual({ label: '1.6', requiresReview: true })
      expect(getEngineCommercialLabel(1998)).toEqual({ label: '2.0', requiresReview: true })
    })

    it('should fallback to range math', () => {
      expect(getEngineCommercialLabel(1005)).toEqual({ label: '1.0', requiresReview: true })
      expect(getEngineCommercialLabel(1600)).toEqual({ label: '1.6', requiresReview: true })
    })

    it('should return null for unknown cc', () => {
      expect(getEngineCommercialLabel(4500)).toEqual({ label: null, requiresReview: true })
    })

    it('should handle custom displacement mappings', () => {
      const custom = { '1332': '1.3 Turbo' }
      expect(getEngineCommercialLabel(1332, custom)).toEqual({ label: '1.3 Turbo', requiresReview: true })
    })
  })

  describe('resolveTransmissionType', () => {
    it('should resolve manual transmissions', () => {
      expect(resolveTransmissionType('VW/GOL 1.0 MEC')).toEqual({ type: 'MANUAL', requiresReview: true })
      expect(resolveTransmissionType('VW/GOL 1.0 MT')).toEqual({ type: 'MANUAL', requiresReview: true })
    })

    it('should resolve automatic transmissions', () => {
      expect(resolveTransmissionType('VW/NIVUS HL TSI AD')).toEqual({ type: 'AUTOMATIC', requiresReview: true })
      expect(resolveTransmissionType('VW/GOL 1.6 AUT')).toEqual({ type: 'AUTOMATIC', requiresReview: true })
    })

    it('should resolve CVT and DSG', () => {
      expect(resolveTransmissionType('HONDA CIVIC CVT')).toEqual({ type: 'CVT', requiresReview: true })
      expect(resolveTransmissionType('GOLF GTI DSG')).toEqual({ type: 'DUAL_CLUTCH', requiresReview: true })
    })

    it('should return UNKNOWN if not matches', () => {
      expect(resolveTransmissionType('VW/GOL 1.0')).toEqual({ type: 'UNKNOWN', requiresReview: true })
    })

    it('should support custom mappings', () => {
      const custom = { 'DSG7': 'DUAL_CLUTCH' }
      expect(resolveTransmissionType('Golf DSG7', custom)).toEqual({ type: 'DUAL_CLUTCH', requiresReview: true })
    })
  })
})
