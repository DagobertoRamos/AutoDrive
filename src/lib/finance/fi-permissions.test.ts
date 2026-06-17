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
