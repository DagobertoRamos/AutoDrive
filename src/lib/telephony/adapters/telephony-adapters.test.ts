// =============================================================================
// Testes dos adapters de telefonia (funções puras — sem DB / sem rede).
// Cobre: resolução por kind, assinatura HMAC (válida/ inválida), normalização
// do contrato genérico e mapeamento de status da Twilio.
// =============================================================================

import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { getTelephonyAdapter } from './registry'
import { GenericWebhookAdapter } from './generic.adapter'
import { TwilioAdapter } from './twilio.adapter'
import { ManualCallAdapter } from './manual.adapter'
import type { TelephonyVerifyContext } from './types'

const SECRET = 'super-secret-webhook-key-1234'

function ctxFor(rawBody: string, sigHeader: string, sigValue: string): TelephonyVerifyContext {
  return { headers: new Headers({ [sigHeader]: sigValue }), rawBody, url: 'https://app/api/webhooks/telephony/generic?cid=c1', secret: SECRET }
}

describe('registry', () => {
  it('resolve adapter por kind', () => {
    expect(getTelephonyAdapter('GENERIC_WEBHOOK')).toBeInstanceOf(GenericWebhookAdapter)
    expect(getTelephonyAdapter('TWILIO')).toBeInstanceOf(TwilioAdapter)
    expect(getTelephonyAdapter('MANUAL')).toBeInstanceOf(ManualCallAdapter)
  })
})

describe('GenericWebhookAdapter', () => {
  const a = new GenericWebhookAdapter()

  it('aceita assinatura HMAC-SHA256 válida e rejeita inválida', () => {
    const body = JSON.stringify({ event: 'answered', callId: 'X1', from: '5511999', to: '5511000' })
    const good = crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')
    expect(a.verifySignature(ctxFor(body, 'x-autodrive-signature', good))).toBe(true)
    expect(a.verifySignature(ctxFor(body, 'x-autodrive-signature', 'deadbeef'))).toBe(false)
    expect(a.verifySignature(ctxFor(body, 'x-autodrive-signature', ''))).toBe(false)
  })

  it('normaliza o contrato genérico', () => {
    const ev = a.normalize({ event: 'completed', callId: 'X1', direction: 'inbound', from: '11', to: '22', durationSec: 42, recording: { url: 'https://r/x.mp3' } })
    expect(ev?.providerCallId).toBe('X1')
    expect(ev?.status).toBe('COMPLETED')
    expect(ev?.direction).toBe('INBOUND')
    expect(ev?.durationSec).toBe(42)
    expect(ev?.recording?.url).toBe('https://r/x.mp3')
  })

  it('deriva status pelo nome do evento quando status ausente', () => {
    expect(a.normalize({ event: 'missed', from: '1', to: '2' })?.status).toBe('MISSED')
    expect(a.normalize({ event: 'ringing', from: '1', to: '2' })?.status).toBe('RINGING')
  })
})

describe('TwilioAdapter', () => {
  const a = new TwilioAdapter()
  it('mapeia CallStatus e direção da Twilio', () => {
    const ev = a.normalize({ CallSid: 'CA1', CallStatus: 'in-progress', Direction: 'inbound', From: '+1', To: '+2', CallDuration: '30' })
    expect(ev?.status).toBe('ANSWERED')
    expect(ev?.direction).toBe('INBOUND')
    expect(ev?.providerCallId).toBe('CA1')
    expect(ev?.durationSec).toBe(30)
  })
  it('fica "preparado" (ready=false) até validação oficial', () => {
    expect(a.ready).toBe(false)
  })
})

describe('ManualCallAdapter', () => {
  it('não autentica via webhook (sem assinatura externa)', () => {
    const a = new ManualCallAdapter()
    expect(a.verifySignature({ headers: new Headers(), rawBody: '', url: '' })).toBe(false)
  })
})
