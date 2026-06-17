// =============================================================================
// Testes dos helpers de fichas (Fase 7) — validação de documentos. Puros.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { requiredDocsForProfile, pendingRequiredDocs } from './proposal-service'

const cfg = { TODOS: ['RG', 'CPF'], CLT: ['Holerite', 'Carteira de Trabalho'], AUTONOMO: ['Declaração de renda'] }

describe('requiredDocsForProfile', () => {
  it('une comuns + perfil, sem duplicar', () => {
    expect(requiredDocsForProfile(cfg, 'CLT')).toEqual(['RG', 'CPF', 'Holerite', 'Carteira de Trabalho'])
  })
  it('sem ocupação retorna só os comuns', () => {
    expect(requiredDocsForProfile(cfg, null)).toEqual(['RG', 'CPF'])
  })
  it('config vazia retorna lista vazia', () => {
    expect(requiredDocsForProfile({}, 'CLT')).toEqual([])
    expect(requiredDocsForProfile(null, 'CLT')).toEqual([])
  })
  it('dedupe é case-insensitive', () => {
    expect(requiredDocsForProfile({ TODOS: ['RG'], CLT: ['rg', 'Holerite'] }, 'CLT')).toEqual(['RG', 'Holerite'])
  })
})

describe('pendingRequiredDocs', () => {
  const required = ['RG', 'CPF', 'Holerite']
  it('exigido sem APROVADO fica pendente', () => {
    const rows = [{ type: 'RG', status: 'APROVADO' }, { type: 'CPF', status: 'PENDENTE' }]
    expect(pendingRequiredDocs(required, rows)).toEqual(['CPF', 'Holerite'])
  })
  it('todos aprovados → sem pendências', () => {
    const rows = required.map((type) => ({ type, status: 'APROVADO' }))
    expect(pendingRequiredDocs(required, rows)).toEqual([])
  })
  it('casa nome case-insensitive', () => {
    expect(pendingRequiredDocs(['RG'], [{ type: 'rg', status: 'APROVADO' }])).toEqual([])
  })
})
