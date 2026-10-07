// =============================================================================
// Testes da decisão pura das Permissões F&I (roleAllowedByList).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { roleAllowedByList } from './fi-permissions'

describe('roleAllowedByList', () => {
  it('lista vazia/indefinida → sem restrição extra (permite)', () => {
    expect(roleAllowedByList([], 'VENDEDOR')).toBe(true)
    expect(roleAllowedByList(undefined, 'VENDEDOR')).toBe(true)
    expect(roleAllowedByList(null, 'GERENTE')).toBe(true)
  })
  it('MASTER nunca é bloqueado', () => {
    expect(roleAllowedByList(['ADM'], 'MASTER')).toBe(true)
  })
  it('lista configurada restringe aos papéis listados', () => {
    expect(roleAllowedByList(['GERENTE', 'ADM'], 'GERENTE')).toBe(true)
    expect(roleAllowedByList(['GERENTE', 'ADM'], 'VENDEDOR')).toBe(false)
  })
})

import { decideFi, effectiveMatrix } from './fi-permissions'

describe('decideFi (capacidades F&I Core)', () => {
  it('config antiga: lista vazia das capacidades originais continua liberada', () => {
    expect(decideFi({ enviarFicha: [] }, 'enviarFicha', 'VENDEDOR')).toBe(true)
  })
  it('padrão seguro: vendedor não vê retorno, comissão nem logs técnicos', () => {
    expect(decideFi({}, 'verRetorno', 'VENDEDOR')).toBe(false)
    expect(decideFi({}, 'verComissao', 'VENDEDOR')).toBe(false)
    expect(decideFi({}, 'verLogsTecnicos', 'GERENTE')).toBe(false)
    expect(decideFi({}, 'verRetorno', 'GERENTE')).toBe(true)
    expect(decideFi({}, 'criarFicha', 'VENDEDOR')).toBe(true)
  })
  it('config v2: a lista é exatamente quem pode (vazia = ninguém)', () => {
    expect(decideFi({ _v: 2, aprovar: [] }, 'aprovar', 'GERENTE')).toBe(false)
    expect(decideFi({ _v: 2, aprovar: ['GERENTE'] }, 'aprovar', 'GERENTE')).toBe(true)
    expect(decideFi({ _v: 2, aprovar: [] }, 'aprovar', 'MASTER')).toBe(true)
  })
  it('matriz efetiva por papel', () => {
    const m = effectiveMatrix({})
    expect(m.verLogsTecnicos).toEqual(['ADM', 'GERENTE_GERAL'])
    expect(m.enviarFicha).toContain('VENDEDOR')
  })
})
