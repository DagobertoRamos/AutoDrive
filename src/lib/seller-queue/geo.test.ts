// =============================================================================
// Testes da validação de presença (puro — sem DB/rede).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { haversineMeters, evaluatePresence, type PresenceConfig } from './geo'

const cfg: PresenceConfig = {
  active: true, presenceMethods: ['GPS', 'QR_CODE', 'DEVICE_CHECK'],
  geofenceLat: -23.5505, geofenceLng: -46.6333, geofenceRadiusM: 150, qrSecret: 'loja-secret-123',
}

describe('haversineMeters', () => {
  it('mesmo ponto = 0', () => {
    expect(haversineMeters(-23.5505, -46.6333, -23.5505, -46.6333)).toBeCloseTo(0, 5)
  })
  it('~1km entre pontos conhecidos', () => {
    const d = haversineMeters(-23.5505, -46.6333, -23.5595, -46.6333) // ~1km ao sul
    expect(d).toBeGreaterThan(900); expect(d).toBeLessThan(1100)
  })
})

describe('evaluatePresence', () => {
  it('sem config ativa → não força (MANUAL_REVIEW ok)', () => {
    const r = evaluatePresence(null, {})
    expect(r.ok).toBe(true); expect(r.method).toBe('MANUAL_REVIEW')
  })
  it('GPS dentro do raio → ok', () => {
    const r = evaluatePresence(cfg, { latitude: -23.5506, longitude: -46.6334 })
    expect(r.ok).toBe(true); expect(r.method).toBe('GPS')
  })
  it('GPS fora do raio → falha com distância', () => {
    const r = evaluatePresence(cfg, { latitude: -23.5600, longitude: -46.6333 })
    expect(r.ok).toBe(false); expect(r.method).toBe('GPS'); expect(r.distanceM).toBeGreaterThan(150)
  })
  it('QR correto → ok; QR errado → falha', () => {
    expect(evaluatePresence(cfg, { qrToken: 'loja-secret-123' }).ok).toBe(true)
    expect(evaluatePresence(cfg, { qrToken: 'errado' }).ok).toBe(false)
  })
  it('device reconhecido → ok', () => {
    expect(evaluatePresence(cfg, { deviceId: 'dev-abc' }).method).toBe('DEVICE_CHECK')
  })
  it('sem nada → falha', () => {
    expect(evaluatePresence(cfg, {}).ok).toBe(false)
  })
})
