// =============================================================================
// Testes — entryTextSearch (busca textual de lançamentos financeiros)
// =============================================================================

import { describe, it, expect } from 'vitest'
import { entryTextSearch } from './finance-service'

describe('entryTextSearch', () => {
  it('retorna null para termo vazio/whitespace', () => {
    expect(entryTextSearch('')).toBeNull()
    expect(entryTextSearch('   ')).toBeNull()
    expect(entryTextSearch(null)).toBeNull()
    expect(entryTextSearch(undefined)).toBeNull()
  })

  it('busca em description, counterparty e documentNumber (case-insensitive)', () => {
    const or = entryTextSearch('SANDERO')
    expect(or).not.toBeNull()
    const keys = or!.map((c) => Object.keys(c)[0])
    expect(keys).toEqual(expect.arrayContaining(['description', 'counterparty', 'documentNumber']))
    const desc = or!.find((c) => 'description' in c) as { description: { contains: string; mode: string } }
    expect(desc.description.contains).toBe('SANDERO')
    expect(desc.description.mode).toBe('insensitive')
  })

  it('inclui match por valor (amount) quando o termo é numérico', () => {
    const or = entryTextSearch('1500')!
    const amountClause = or.find((c) => 'amount' in c) as { amount: number } | undefined
    expect(amountClause?.amount).toBe(1500)
  })

  it('aceita valor com vírgula/ponto (pt-BR) no match de amount', () => {
    const or = entryTextSearch('1.500,50')!
    const amountClause = or.find((c) => 'amount' in c) as { amount: number } | undefined
    expect(amountClause?.amount).toBe(1500.5)
  })

  it('NÃO inclui amount quando o termo não tem dígitos', () => {
    const or = entryTextSearch('fornecedor xyz')!
    expect(or.some((c) => 'amount' in c)).toBe(false)
  })
})
