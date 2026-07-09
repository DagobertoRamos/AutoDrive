import { describe, it, expect } from 'vitest'
import { normalizePlate, canonicalPlate, plateMatches, platePrefix } from './plate'

describe('normalizePlate', () => {
  it('uppercases e remove hífen/espaço/lixo', () => {
    expect(normalizePlate('abc-1d23')).toBe('ABC1D23')
    expect(normalizePlate(' ABC 1234 ')).toBe('ABC1234')
    expect(normalizePlate('abc1234')).toBe('ABC1234')
  })
  it('trata null/undefined', () => {
    expect(normalizePlate(null)).toBe('')
    expect(normalizePlate(undefined)).toBe('')
  })
})

describe('canonicalPlate — antigo ⇄ Mercosul', () => {
  it('converte o 5º char letra→dígito só em placas de 7', () => {
    // Mercosul ABC1C34 (índice4=C=2) ⇄ antigo ABC1234
    expect(canonicalPlate('ABC1C34')).toBe('ABC1234')
    expect(canonicalPlate('ABC1234')).toBe('ABC1234')
    // a mesma placa nos dois formatos colide
    expect(canonicalPlate('ABC1C34')).toBe(canonicalPlate('ABC1234'))
  })
  it('não mexe em parciais', () => {
    expect(canonicalPlate('ABC1')).toBe('ABC1')
    expect(canonicalPlate('ABC')).toBe('ABC')
  })
})

describe('plateMatches — critérios de aceite da busca', () => {
  const stored = 'ABC1D23' // como salvo no banco (Mercosul)
  it('placa completa, com/sem traço, maiúscula/minúscula', () => {
    expect(plateMatches('ABC1D23', stored)).toBe(true)
    expect(plateMatches('abc1d23', stored)).toBe(true)
    expect(plateMatches('ABC-1D23', stored)).toBe(true)
    expect(plateMatches(' abc 1d23 ', stored)).toBe(true)
  })
  it('placa parcial (prefixo)', () => {
    expect(plateMatches('ABC', stored)).toBe(true)
    expect(plateMatches('ABC1', stored)).toBe(true)
    expect(plateMatches('abc1d', stored)).toBe(true)
  })
  it('equivalência antigo ⇄ Mercosul (mesma placa)', () => {
    // busca no formato antigo encontra o registro salvo em Mercosul e vice-versa
    expect(plateMatches('ABC1234', 'ABC1C34')).toBe(true)
    expect(plateMatches('ABC1C34', 'ABC1234')).toBe(true)
  })
  it('não casa placa diferente', () => {
    expect(plateMatches('XYZ9999', stored)).toBe(false)
    expect(plateMatches('ABD1D23', stored)).toBe(false)
  })
  it('query curta demais não casa (evita falso positivo)', () => {
    expect(plateMatches('A', stored)).toBe(false)
    expect(plateMatches('', stored)).toBe(false)
  })
})

describe('platePrefix', () => {
  it('devolve as 3 primeiras letras normalizadas', () => {
    expect(platePrefix('abc-1d23')).toBe('ABC')
    expect(platePrefix('ab')).toBe('AB')
  })
})
