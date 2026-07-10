import { describe, it, expect } from 'vitest'
import { normCpf, isValidCpf, normPhone, phoneKey, normEmail, normName, nameSimilarity, externalKey } from './identity'

describe('normCpf / isValidCpf', () => {
  it('remove pontuação', () => {
    expect(normCpf('529.982.247-25')).toBe('52998224725')
    expect(normCpf(null)).toBe('')
  })
  it('valida dígito verificador', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true) // CPF válido conhecido
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('123')).toBe(false)
  })
})

describe('normPhone / phoneKey', () => {
  it('tira DDI 55, 0 de DDD, formatação', () => {
    expect(normPhone('+55 (11) 99999-8888')).toBe('11999998888')
    expect(normPhone('011 3333-4444')).toBe('1133334444')
    expect(normPhone('123')).toBeNull()
  })
  it('phoneKey usa últimos 8 (robusto a DDI/formatos)', () => {
    expect(phoneKey('+55 11 99999-8888')).toBe('99998888')
    expect(phoneKey('99999-8888')).toBe('99998888')
  })
})

describe('normEmail', () => {
  it('trim + minúsculo + valida', () => {
    expect(normEmail('  Joao@Email.COM ')).toBe('joao@email.com')
    expect(normEmail('sem-arroba')).toBeNull()
  })
})

describe('normName / nameSimilarity', () => {
  it('normaliza (minúsculo, sem acento, tokens ordenados)', () => {
    expect(normName('João da Silva')).toBe('da joao silva')
    expect(normName('SILVA joão DA')).toBe('da joao silva')
  })
  it('similaridade alta p/ mesmo nome em ordem diferente', () => {
    expect(nameSimilarity('João Silva', 'Silva João')).toBe(1)
    expect(nameSimilarity('João Silva', 'Maria Souza')).toBe(0)
    expect(nameSimilarity('João Pedro Silva', 'João Silva')).toBeGreaterThan(0.5)
  })
})

describe('externalKey (idempotência)', () => {
  it('normaliza source+id ou null', () => {
    expect(externalKey('webmotors', 'ABC123')).toBe('WEBMOTORS:ABC123')
    expect(externalKey('WHATSAPP', '')).toBeNull()
    expect(externalKey('', 'x')).toBeNull()
  })
})
