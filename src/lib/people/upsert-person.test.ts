import { describe, expect, it } from 'vitest'
import { personFields } from './upsert-person'

describe('personFields', () => {
  it('pessoa física: normaliza documentos/telefone e descarta vazios', () => {
    const f = personFields({ type: 'FISICA', cpf: '199.955.958-42', nomeCompleto: ' Sidney Ramos ', rg: '', phone: '(11) 94771-8959', cep: '06505-064', email: '', whatsapp: true, dataNascimento: '1978-08-18' })
    expect(f).toMatchObject({ type: 'FISICA', cpf: '19995595842', nomeCompleto: 'Sidney Ramos', phone: '11947718959', cep: '06505064', whatsapp: true })
    expect(f.dataNascimento).toBeInstanceOf(Date)
    expect('rg' in f).toBe(false)
    expect('email' in f).toBe(false)
    expect('cnpj' in f).toBe(false)
  })
  it('pessoa jurídica: nome de exibição é a razão social', () => {
    const f = personFields({ type: 'JURIDICA', cnpj: '12.345.678/0001-90', razaoSocial: 'Loja X Ltda', cpf: '123' })
    expect(f).toMatchObject({ type: 'JURIDICA', cnpj: '12345678000190', nomeCompleto: 'Loja X Ltda', razaoSocial: 'Loja X Ltda' })
    expect('cpf' in f).toBe(false)
  })
})
