import { describe, it, expect } from 'vitest'
import { parseSiteLead, buildLeadMessage, isValidCnpj, formatCnpj } from './leads-core'

const ok = { kind: 'contact', name: 'Ana Souza', phone: '(11) 98888-7777', email: 'ana@x.com', message: 'Quero saber do Onix', consent: 'yes' }

describe('parseSiteLead', () => {
  it('aceita contato válido', () => {
    const r = parseSiteLead(ok)
    expect(r.ok && r.value).toMatchObject({ kind: 'contact', name: 'Ana Souza', intent: null, vehicleId: null })
  })
  it('campo-isca preenchido = spam (responde ok, sem gravar)', () => {
    const r = parseSiteLead({ ...ok, website: 'http://spam' })
    expect(r).toMatchObject({ ok: false, status: 200, spam: true })
  })
  it('validações', () => {
    expect(parseSiteLead({ ...ok, kind: 'x' }).ok).toBe(false)
    expect(parseSiteLead({ ...ok, name: 'A' }).ok).toBe(false)
    expect(parseSiteLead({ ...ok, phone: '9999' }).ok).toBe(false)
    expect(parseSiteLead({ ...ok, email: 'nope' }).ok).toBe(false)
    expect(parseSiteLead({ ...ok, consent: undefined }).ok).toBe(false)
    expect(parseSiteLead({ ...ok, message: '' }).ok).toBe(false)
    expect(parseSiteLead({ ...ok, kind: 'vehicle_interest', message: '' }).ok).toBe(false) // sem veículo
  })
  it('interesse no veículo com detalhes e rastreio', () => {
    const r = parseSiteLead({ ...ok, kind: 'vehicle_interest', intent: 'visita', vehicleId: 'cmx1234567890abc', message: '', paymentMethod: 'Financiamento', hasTrade: 'Sim', tradeVehicle: 'Gol', visitDate: '2026-10-01', utmSource: 'google', junk: 'x' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.details).toEqual({ paymentMethod: 'Financiamento', hasTrade: 'Sim', tradeVehicle: 'Gol', visitDate: '2026-10-01' })
    expect(r.value.tracking).toEqual({ utmSource: 'google' })
    expect(buildLeadMessage(r.value, 'Chevrolet Onix LT')).toBe(
      'Agendamento de visita.\nVeículo: Chevrolet Onix LT\nForma de pagamento: Financiamento\nCarro na troca: Sim\nVeículo da troca: Gol\nVisita: 2026-10-01',
    )
  })
})

describe('serviços opcionais', () => {
  const base = { name: 'Ana Souza', phone: '(11) 99999-1234', consent: 'yes' }
  it('venda seu carro exige os dados do veículo e monta o texto', () => {
    expect(parseSiteLead({ ...base, kind: 'sell_car', brand: 'VW', model: 'Gol' })).toMatchObject({ ok: false, error: 'Informe a cidade.' })
    const r = parseSiteLead({ ...base, kind: 'sell_car', city: 'Osasco', brand: 'VW', model: 'Gol', year: '2015/2016', mileage: '98000', targetPrice: 'R$ 38.000', plate: 'abc-1d23', vehicleStatus: ['Quitado', 'Possui débitos'] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.details).toMatchObject({ plate: 'ABC1D23', vehicleStatus: 'Quitado, Possui débitos' })
    const msg = buildLeadMessage(r.value, null)
    expect(msg).toContain('Venda seu carro (pré-avaliação).')
    expect(msg).toContain('Veículo do cliente: VW · Gol · 2015/2016 · 98000 km')
    expect(msg).toContain('Situação: Quitado, Possui débitos')
    expect(msg).toContain('Valor pretendido: R$ 38.000')
  })
  it('encontre seu carro exige marca, modelo e orçamento', () => {
    expect(parseSiteLead({ ...base, kind: 'find_car', brand: 'Jeep', model: 'Compass' })).toMatchObject({ ok: false, error: 'Informe o orçamento.' })
    const r = parseSiteLead({ ...base, kind: 'find_car', brand: 'Jeep', model: 'Compass', yearMin: '2020', budget: 'até R$ 120 mil', wantsFinancing: 'Sim' })
    expect(r.ok && buildLeadMessage(r.value, null)).toContain('Procura: Jeep · Compass · a partir de 2020')
  })
})

describe('Financia Fácil e Atacado', () => {
  const base = { name: 'Ana Souza', phone: '(11) 99999-1234', consent: 'yes' }
  it('CNPJ: dígitos verificadores e formato', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81')
  })
  it('atacado recusa CNPJ inválido e formata o válido', () => {
    expect(parseSiteLead({ ...base, kind: 'wholesale', companyName: 'Loja X', cnpj: '123' })).toMatchObject({ ok: false, error: 'CNPJ inválido.' })
    const r = parseSiteLead({ ...base, kind: 'wholesale', companyName: 'Loja X Ltda', cnpj: '11222333000181', interest: 'SUVs até 2019' })
    expect(r.ok && buildLeadMessage(r.value, null)).toContain('Empresa: Loja X Ltda · 11.222.333/0001-81')
  })
  it('financia fácil exige o carro negociado', () => {
    expect(parseSiteLead({ ...base, kind: 'private_financing', brand: 'Fiat', model: 'Argo', year: '2021' })).toMatchObject({ ok: false, error: 'Informe o valor combinado.' })
    const r = parseSiteLead({ ...base, kind: 'private_financing', brand: 'Fiat', model: 'Argo', year: '2021', vehicleValue: 'R$ 65.000,00', downPayment: 'R$ 15.000,00' })
    const msg = r.ok ? buildLeadMessage(r.value, null) : ''
    expect(msg).toContain('Carro negociado (particular): Fiat · Argo · 2021')
    expect(msg).toContain('Valor combinado: R$ 65.000,00')
  })
})

