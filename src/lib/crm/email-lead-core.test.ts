import { describe, expect, it } from 'vitest'
import { channelEmailAddress, channelKeyFromAddress, detectPortal, htmlToText, normalizeInboundEmail, parseLeadEmail } from './email-lead-core'

describe('Leitura de e-mail de lead', () => {
  it('normaliza Postmark, SendGrid e Mailgun', () => {
    const pm = normalizeInboundEmail({ From: 'Webmotors <leads@webmotors.com.br>', ToFull: [{ Email: 'leads+AbCdEfGhIjKlMnOpQr@in.autodrive.com' }], Subject: 'Novo lead', TextBody: 'Nome: Ana', MessageID: 'm1' })
    expect(pm).toMatchObject({ from: 'leads@webmotors.com.br', to: ['leads+abcdefghijklmnopqr@in.autodrive.com'], messageId: 'm1' })
    const sg = normalizeInboundEmail({ from: 'x@icarros.com.br', to: 'leads+abcdefghijklmnopqr@in.autodrive.com', subject: 's', html: '<p>Nome: Bia</p>' })
    expect(sg?.text).toContain('Nome: Bia')
    const mg = normalizeInboundEmail({ sender: 'a@b.com', recipient: 'leads+abcdefghijklmnopqr@in.autodrive.com', 'body-plain': 'oi' })
    expect(mg?.text).toBe('oi')
    expect(normalizeInboundEmail({ from: 'a@b.com' })).toBeNull()
  })

  it('acha a chave do canal no endereço exclusivo (só no domínio da plataforma)', () => {
    expect(channelKeyFromAddress(['outro@x.com', 'leads+abcdefghijklmnopqr@in.autodrive.com'], 'in.autodrive.com')).toBe('abcdefghijklmnopqr')
    expect(channelKeyFromAddress(['leads+abcdefghijklmnopqr@golpe.com'], 'in.autodrive.com')).toBeNull()
    expect(channelEmailAddress('KEY123', '@In.Autodrive.com')).toBe('leads+KEY123@in.autodrive.com')
    expect(channelEmailAddress('KEY123', '')).toBeNull()
  })

  it('identifica o portal pelo remetente ou pelo link', () => {
    expect(detectPortal('noreply@webmotors.com.br', '')?.code).toBe('WEBMOTORS')
    expect(detectPortal('alerta@gmail.com', 'veja https://www.icarros.com.br/anuncio/123456')?.code).toBe('ICARROS')
    expect(detectPortal('a@b.com', 'nada')).toBeNull()
  })

  it('extrai dados de um e-mail de lead típico', () => {
    const text = [
      'Você recebeu uma nova proposta!',
      'Nome: João da Silva',
      'Telefone: (11) 98765-4321',
      'E-mail: joao.silva@gmail.com',
      'Veículo: Toyota Corolla XEi 2.0 2022',
      'Placa: ABC-1D23',
      'Mensagem: Aceita meu Onix na troca?',
      'Tenho entrada de 20 mil.',
      '',
      'Ver anúncio: https://www.webmotors.com.br/comprar/toyota/corolla/xei/4-portas/2022/48123456',
      'Responda pelo Cockpit: contato@webmotors.com.br',
    ].join('\n')
    const p = parseLeadEmail({ messageId: 'm', from: 'leads@webmotors.com.br', to: ['leads+abcdefghijklmnopqr@in.autodrive.com'], subject: 'Lead', text, date: '' })
    expect(p.name).toBe('João da Silva')
    expect(p.phone).toBe('11987654321')
    expect(p.email).toBe('joao.silva@gmail.com')
    expect(p.vehicle).toBe('Toyota Corolla XEi 2.0 2022')
    expect(p.plate).toBe('ABC1D23')
    expect(p.message).toBe('Aceita meu Onix na troca?\nTenho entrada de 20 mil.')
    expect(p.listingId).toBe('48123456')
    expect(p.portal?.code).toBe('WEBMOTORS')
  })

  it('ignora e-mails do próprio portal e de não-responda', () => {
    const p = parseLeadEmail({ messageId: '', from: 'nao-responda@icarros.com.br', to: ['leads+abcdefghijklmnopqr@in.x.com'], subject: '', text: 'Cliente: Maria\nCelular 21 99999-0000\nnaoresponda@icarros.com.br\nmaria@hotmail.com', date: '' })
    expect(p.email).toBe('maria@hotmail.com')
    expect(p.phone).toBe('21999990000')
    expect(p.name).toBe('Maria')
  })

  it('converte HTML em texto', () => {
    expect(htmlToText('<table><tr><td>Nome:</td><td>Ana&nbsp;Lima</td></tr></table><br>Fim')).toContain('Nome: Ana Lima')
  })
})
