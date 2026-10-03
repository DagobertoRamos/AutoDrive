import { describe, expect, it } from 'vitest'
import {
  docKind, maskDateBR, maskDoc, maskPhoneQuick, maskCepQuick, isoToBR, parseDateBR, validateQuickCustomer, parseCota,
  type QuickCustomerInput,
} from './quick-create'

const TODAY = new Date(2026, 9, 3)

const PF: QuickCustomerInput = {
  name: 'Maria da Silva', doc: '529.982.247-25', birthDate: '10/05/1990', regDoc: '12.345.678-9',
  email: 'maria@exemplo.com', phone: '(11)9.9999-8888', cep: '01310-100', logradouro: 'Av. Paulista',
  numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', estado: 'SP',
}
const SOCIO = { nome: 'João Souza', cpf: '529.982.247-25', rg: '11.222.333-4', nascimento: '02/03/1980', email: 'joao@x.com', phone: '11988887777', cep: '01310100', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'São Paulo', estado: 'SP', cota: '100' }
const PJ: QuickCustomerInput = { ...PF, name: 'Empresa X Ltda', doc: '11.222.333/0001-81', regDoc: 'ISENTO', birthDate: '01/01/2010', socio: SOCIO }

describe('máscaras', () => {
  it('telefone celular e fixo', () => {
    expect(maskPhoneQuick('11999998888')).toBe('(11)9.9999-8888')
    expect(maskPhoneQuick('1133334444')).toBe('(11)3333-4444')
  })
  it('data, CEP e documento', () => {
    expect(maskDateBR('10051990')).toBe('10/05/1990')
    expect(maskCepQuick('01310100')).toBe('01310-100')
    expect(maskDoc('52998224725')).toBe('529.982.247-25')
    expect(maskDoc('11222333000181')).toBe('11.222.333/0001-81')
    expect(isoToBR('2010-01-31')).toBe('31/01/2010')
  })
  it('PF/PJ pelos dígitos', () => {
    expect(docKind('52998224725')).toBe('PF')
    expect(docKind('11222333000181')).toBe('PJ')
  })
})

describe('parseDateBR', () => {
  it('aceita data real passada', () => expect(parseDateBR('29/02/2000', TODAY)).toBe('2000-02-29'))
  it('recusa data inexistente', () => expect(parseDateBR('31/02/2000', TODAY)).toBeNull())
  it('recusa data futura', () => expect(parseDateBR('04/10/2026', TODAY)).toBeNull())
  it('aceita hoje', () => expect(parseDateBR('03/10/2026', TODAY)).toBe('2026-10-03'))
})

describe('validateQuickCustomer', () => {
  it('PF completo é válido', () => expect(validateQuickCustomer(PF, TODAY)).toBeNull())
  it('PJ com IE ISENTO é válido', () => expect(validateQuickCustomer(PJ, TODAY)).toBeNull())
  it('CPF inválido', () => expect(validateQuickCustomer({ ...PF, doc: '111.111.111-11' }, TODAY)).toBe('CPF inválido.'))
  it('exige RG', () => expect(validateQuickCustomer({ ...PF, regDoc: '' }, TODAY)).toBe('Informe o RG.'))
  it('exige IE na PJ', () => expect(validateQuickCustomer({ ...PJ, regDoc: '' }, TODAY)).toBe('Informe a inscrição estadual.'))
  it('e-mail inválido', () => expect(validateQuickCustomer({ ...PF, email: 'x@y' }, TODAY)).toBe('E-mail inválido.'))
  it('aceita fixo', () => expect(validateQuickCustomer({ ...PF, phone: '1133334444' }, TODAY)).toBeNull())
  it('exige número', () => expect(validateQuickCustomer({ ...PF, numero: '' }, TODAY)).toBe('Informe o número.'))
  it('exige UF válida', () => expect(validateQuickCustomer({ ...PF, estado: 'XX' }, TODAY)).toBe('Informe a UF.'))
  it('data futura', () => expect(validateQuickCustomer({ ...PF, birthDate: '01/01/2030' }, TODAY)).toBe('Data de nascimento inválida.'))
})

describe('sócio proprietário (só CNPJ)', () => {
  it('PJ completo passa; PF não pede sócio', () => {
    expect(validateQuickCustomer(PJ, TODAY)).toBeNull()
    expect(validateQuickCustomer({ ...PF, socio: null }, TODAY)).toBeNull()
  })
  it('PJ sem sócio é barrado', () => expect(validateQuickCustomer({ ...PJ, socio: null }, TODAY)).toBe('Informe o nome completo do sócio.'))
  it('valida CPF, nascimento, endereço e participação', () => {
    expect(validateQuickCustomer({ ...PJ, socio: { ...SOCIO, cpf: '111.111.111-11' } }, TODAY)).toBe('CPF do sócio inválido.')
    expect(validateQuickCustomer({ ...PJ, socio: { ...SOCIO, nascimento: '31/02/1980' } }, TODAY)).toBe('Data de nascimento do sócio inválida.')
    expect(validateQuickCustomer({ ...PJ, socio: { ...SOCIO, numero: '' } }, TODAY)).toBe('Informe o número do endereço do sócio.')
    expect(validateQuickCustomer({ ...PJ, socio: { ...SOCIO, cota: '0' } }, TODAY)).toBe('Informe a participação do sócio (%).')
    expect(parseCota('33,335')).toBe(33.34)
    expect(parseCota('150')).toBeNull()
  })
})
