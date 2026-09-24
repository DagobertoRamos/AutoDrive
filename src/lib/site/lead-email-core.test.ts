import { describe, it, expect } from 'vitest'
import { buildCustomerEmail, buildInternalEmail, sanitizeEmailSettings } from './lead-email-core'
import type { SiteLeadInput } from './leads-core'

const lead: SiteLeadInput = {
  kind: 'vehicle_interest', intent: 'visita', name: 'Ana <b>Souza</b>', phone: '(11) 99999-1234', email: 'ana@x.com',
  message: 'Posso ir <script>alert(1)</script> sábado?', vehicleId: 'v1',
  details: { visitDate: '2026-09-27', visitPeriod: 'Manhã', ignorado: 'x' }, tracking: { utmSource: 'instagram' },
}
const ctx = { storeName: 'Loja X', brandColor: '#079ca6', protocol: '#12', vehicle: { title: 'VW T-Cross', price: 'R$ 99.900', url: 'https://loja.com/veiculos/a' }, panelUrl: 'https://app/crm/leads/1', whatsappUrl: 'https://wa.me/5511', repeat: false }

describe('e-mails de lead', () => {
  it('config: só e-mails válidos, sem repetição, até 5', () => {
    expect(sanitizeEmailSettings({ enabled: 1, recipients: 'a@x.com, A@x.com; ruim, b@y.com.br', notifyCustomer: true }))
      .toEqual({ enabled: true, recipients: ['a@x.com', 'b@y.com.br'], notifyCustomer: true })
    expect(sanitizeEmailSettings(null)).toEqual({ enabled: false, recipients: [], notifyCustomer: false })
  })
  it('aviso interno escapa o que veio do formulário e traz os detalhes', () => {
    const e = buildInternalEmail(lead, ctx)
    expect(e.subject).toBe('Novo lead do site: Agendamento de visita — VW T-Cross (#12)')
    expect(e.html).not.toContain('<script>')
    expect(e.html).not.toContain('<b>Souza</b>')
    expect(e.html).toContain('&lt;script&gt;')
    expect(e.html).toContain('Data preferida')
    expect(e.html).not.toContain('ignorado')
    expect(e.html).toContain('https://wa.me/5511999991234')
    expect(e.text).toContain('Campanha: instagram')
    expect(buildInternalEmail(lead, { ...ctx, repeat: true }).subject).toMatch(/^Nova solicitação de cliente em atendimento/)
  })
  it('confirmação ao cliente usa o primeiro nome e o protocolo', () => {
    const e = buildCustomerEmail(lead, ctx)
    expect(e.subject).toBe('Recebemos sua solicitação #12 — Loja X')
    expect(e.html).toContain('Olá, Ana!')
    expect(e.text).toContain('agendamento de visita do VW T-Cross')
  })
})
