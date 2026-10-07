import { describe, expect, it } from 'vitest'
import { IDENTITY_LOCK_MESSAGE, identityLockError, identityLocked } from './identity-lock'

describe('trava de CPF/CNPJ/e-mail', () => {
  const cur = { cpf: '537.296.728-51', email: 'a@b.com', cnpj: null }
  it('MASTER altera tudo', () => {
    expect(identityLockError('MASTER', cur, { cpf: '111', email: 'x@y.com' })).toBeNull()
  })
  it('outros não trocam valor preenchido', () => {
    expect(identityLockError('ADM', cur, { cpf: '11111111111' })).toBe(IDENTITY_LOCK_MESSAGE)
    expect(identityLockError('GERENTE', cur, { email: 'outro@b.com' })).toBe(IDENTITY_LOCK_MESSAGE)
  })
  it('mesmo valor com outra máscara/caixa passa; vazio pode ser preenchido', () => {
    expect(identityLockError('ADM', cur, { cpf: '53729672851', email: ' A@B.COM ' })).toBeNull()
    expect(identityLockError('ADM', cur, { cnpj: '12.345.678/0001-90' })).toBeNull()
    expect(identityLockError('ADM', cur, { name: 'x' })).toBeNull()
  })
  it('mapeia nomes diferentes', () => {
    expect(identityLockError('ADM', { document: '123' }, { cpfCnpj: '456' }, { cpfCnpj: 'document' })).toBe(IDENTITY_LOCK_MESSAGE)
  })
  it('tela', () => {
    expect(identityLocked('ADM', '537.296.728-51')).toBe(true)
    expect(identityLocked('ADM', 'a@b.com')).toBe(true)
    expect(identityLocked('ADM', '')).toBe(false)
    expect(identityLocked('MASTER', 'a@b.com')).toBe(false)
  })
})
