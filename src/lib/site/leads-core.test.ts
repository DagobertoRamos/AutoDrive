import { describe, it, expect } from 'vitest'
import { parseSiteLead, buildLeadMessage } from './leads-core'

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
