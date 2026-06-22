// =============================================================================
// Testes do utilitário mobile/client — saneamento de headers e detecção mobile.
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  sanitizeHeaderValue,
  normalizePlatform,
  readMobileClient,
  isMobileClient,
  MOBILE_HEADERS,
  type HeaderGetter,
} from './client'

/** Headers fake a partir de um mapa. */
function fakeHeaders(map: Record<string, string | null>): HeaderGetter {
  return { get: (name: string) => map[name] ?? null }
}

describe('sanitizeHeaderValue', () => {
  it('normaliza deviceId (apara espaços)', () => {
    expect(sanitizeHeaderValue('  abc-123  ')).toBe('abc-123')
  })

  it('remove CR/LF/tab', () => {
    expect(sanitizeHeaderValue('a\r\nb\tc')).toBe('abc')
  })

  it('trunca em 120 caracteres', () => {
    const long = 'x'.repeat(200)
    expect(sanitizeHeaderValue(long)).toHaveLength(120)
  })

  it('retorna string vazia para null/undefined', () => {
    expect(sanitizeHeaderValue(null)).toBe('')
    expect(sanitizeHeaderValue(undefined)).toBe('')
  })
})

describe('normalizePlatform', () => {
  it('aceita android', () => {
    expect(normalizePlatform('android')).toBe('android')
  })

  it('IOS em maiúsculo vira ios', () => {
    expect(normalizePlatform('IOS')).toBe('ios')
  })

  it('aceita web', () => {
    expect(normalizePlatform('web')).toBe('web')
  })

  it('plataforma desconhecida vira unknown', () => {
    expect(normalizePlatform('symbian')).toBe('unknown')
    expect(normalizePlatform('')).toBe('unknown')
    expect(normalizePlatform(null)).toBe('unknown')
  })
})

describe('readMobileClient', () => {
  it('extrai e normaliza os três headers', () => {
    const h = fakeHeaders({
      [MOBILE_HEADERS.deviceId]:   '  dev\t01  ',
      [MOBILE_HEADERS.platform]:   'ANDROID',
      [MOBILE_HEADERS.appVersion]: '1.0.0\n',
    })
    expect(readMobileClient(h)).toEqual({ deviceId: 'dev01', platform: 'android', appVersion: '1.0.0' })
  })

  it('defaults seguros quando ausentes', () => {
    expect(readMobileClient(fakeHeaders({}))).toEqual({ deviceId: '', platform: 'unknown', appVersion: '' })
  })
})

describe('isMobileClient', () => {
  it('verdadeiro para android e ios', () => {
    expect(isMobileClient({ deviceId: '', platform: 'android', appVersion: '' })).toBe(true)
    expect(isMobileClient({ deviceId: '', platform: 'ios', appVersion: '' })).toBe(true)
  })

  it('falso para web e unknown', () => {
    expect(isMobileClient({ deviceId: '', platform: 'web', appVersion: '' })).toBe(false)
    expect(isMobileClient({ deviceId: '', platform: 'unknown', appVersion: '' })).toBe(false)
  })
})
