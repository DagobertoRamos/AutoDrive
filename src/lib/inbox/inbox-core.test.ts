import { describe, expect, it } from 'vitest'
import { canReplyNow, messagePreview, waDigits, whatsappMessageText } from './inbox-core'

describe('Caixa de Entrada — regras puras', () => {
  it('WhatsApp: responde até 24 h depois da última mensagem do cliente', () => {
    const now = new Date('2026-10-07T12:00:00Z')
    expect(canReplyNow('WHATSAPP', new Date('2026-10-07T00:00:00Z'), now).ok).toBe(true)
    const late = canReplyNow('WHATSAPP', new Date('2026-10-06T11:00:00Z'), now)
    expect(late.ok).toBe(false)
    expect(!late.ok && late.reason).toBe('WINDOW')
    expect(canReplyNow('WHATSAPP', null, now).ok).toBe(false)
  })

  it('canal sem resposta integrada não finge que tem', () => {
    const r = canReplyNow('OLX', new Date())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toBe('Este canal ainda não permite resposta integrada.')
  })

  it('texto legível de cada tipo de mensagem do WhatsApp', () => {
    expect(whatsappMessageText({ type: 'text', text: { body: 'Oi' } })).toEqual({ type: 'TEXT', text: 'Oi' })
    expect(whatsappMessageText({ type: 'image', image: {} }).text).toBe('[Imagem]')
    expect(whatsappMessageText({ type: 'audio' }).type).toBe('AUDIO')
    expect(whatsappMessageText({ type: 'interactive', interactive: { button_reply: { title: 'Quero' } } }).text).toBe('Quero')
    expect(whatsappMessageText({ type: 'xyz' }).text).toBe('[Mensagem não suportada]')
  })

  it('prévia e número para wa.me', () => {
    expect(messagePreview('a   b\n c', 10)).toBe('a b c')
    expect(messagePreview('x'.repeat(20), 10)).toHaveLength(10)
    expect(waDigits('(11) 98765-4321')).toBe('5511987654321')
    expect(waDigits('5511987654321')).toBe('5511987654321')
  })
})
