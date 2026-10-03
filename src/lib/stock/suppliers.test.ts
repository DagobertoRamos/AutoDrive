import { describe, expect, it } from 'vitest'
import { personTypeOf, supplierAddress, supplierData } from './suppliers'

const CNPJ = '11.222.333/0001-81'
const CPF = '529.982.247-25'
const addr = { cep: '06420-130', street: 'Av. Henrique Gonçalves Baptista', number: '2245', district: 'Jardim Belval', city: 'Barueri', state: 'sp' }

describe('fornecedor — PF/PJ e obrigatórios', () => {
  it('PF/PJ pelo documento', () => {
    expect(personTypeOf(CNPJ)).toBe('PJ')
    expect(personTypeOf(CPF)).toBe('PF')
    expect(personTypeOf('123')).toBeNull()
  })

  it('exige tipo, documento válido, nome e telefone', () => {
    expect(supplierData({ document: CNPJ, legalName: 'X' })).toMatchObject({ ok: false, error: 'Selecione o tipo de fornecedor.' })
    expect(supplierData({ kind: 'PECAS', legalName: 'X' })).toMatchObject({ ok: false, error: 'Informe o CPF ou CNPJ.' })
    expect(supplierData({ kind: 'PECAS', document: '11.222.333/0001-82', legalName: 'X' })).toMatchObject({ ok: false, error: 'CNPJ inválido.' })
    expect(supplierData({ kind: 'PECAS', document: CNPJ })).toMatchObject({ ok: false, error: 'Informe a razão social.' })
    expect(supplierData({ kind: 'PECAS', document: CNPJ, legalName: 'Auto Peças Ltda' })).toMatchObject({ ok: false, error: 'Informe o WhatsApp ou telefone.' })
  })

  it('PJ: razão social + fantasia; PF: nome completo vira os dois', () => {
    const pj = supplierData({ kind: 'MATERIAL_ESCRITORIO', document: CNPJ, legalName: 'Papelaria Central Ltda', name: 'Papelaria Central', whatsapp: '(11) 99999-0000', rg: 'x' })
    expect(pj.ok && pj.data).toMatchObject({ personType: 'PJ', document: '11222333000181', legalName: 'Papelaria Central Ltda', name: 'Papelaria Central', whatsapp: '11999990000', rg: null })
    const pf = supplierData({ kind: 'DESPACHANTE', document: CPF, name: 'João da Silva', phone: '1133334444', repName: 'ignorado' })
    expect(pf.ok && pf.data).toMatchObject({ personType: 'PF', name: 'João da Silva', legalName: 'João da Silva', repName: null })
  })

  it('fornecedor de veículos (contrato) exige endereço e representante da PJ', () => {
    const base = { kind: 'VEICULOS', document: CNPJ, legalName: 'Tchescocar Multimarcas Ltda', whatsapp: '11999990000' }
    const r = supplierData(base)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('CEP, logradouro, número, bairro, cidade, UF, representante legal, CPF do representante')
    const ok = supplierData({ ...base, ...addr, repName: 'Fulano', repCpf: CPF })
    expect(ok.ok && ok.data.state).toBe('SP')
    const pf = supplierData({ kind: 'VEICULOS', document: CPF, name: 'Particular', whatsapp: '11999990000', ...addr })
    expect(pf.ok).toBe(true)
  })

  it('endereço em uma linha', () => {
    expect(supplierAddress({ ...addr, cep: '06420130', state: 'SP' })).toBe('Av. Henrique Gonçalves Baptista, 2245, Jardim Belval, Barueri/SP, CEP 06420-130')
    expect(supplierAddress({ address: 'Rua antiga, 10', city: 'X' })).toBe('Rua antiga, 10')
  })
})
