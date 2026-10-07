import { describe, expect, it } from 'vitest'
import { duplicateMessage, uniqueFields } from './prisma-errors'

describe('P2002 diz o campo certo', () => {
  it('lê o campo do meta.target', () => {
    expect(uniqueFields({ target: ['email'] })).toEqual(['email'])
    expect(uniqueFields({ target: 'users_cpf_key' })).toEqual(['cpf'])
    expect(uniqueFields({ driverAdapterError: { cause: { constraint: { fields: ['plate'] } } } })).toEqual(['plate'])
    expect(uniqueFields(undefined)).toEqual([])
  })
  it('e-mail duplicado não vira "CPF"', () => {
    expect(duplicateMessage(['email'])).toBe('Já existe outro cadastro com esse valor no campo e-mail.')
    expect(duplicateMessage(['tenantId', 'plate'])).toBe('Já existe outro cadastro com esse valor no campo placa.')
    expect(duplicateMessage(['email', 'cpf'])).toBe('Já existe outro cadastro com esse valor nos campos e-mail, CPF.')
    expect(duplicateMessage([])).toBe('Já existe um cadastro com esses dados.')
  })
})
