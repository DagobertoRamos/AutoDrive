import { describe, expect, it } from 'vitest'
import { correlationId, eventKey, maskPayload, MAX_ATTEMPTS, nextAttemptAt, payloadHash, stableStringify, stripAuthKeys } from './inbox-core'

describe('Gateway de Entrada — regras puras', () => {
  it('mesmo corpo com chaves em outra ordem gera o mesmo hash', () => {
    expect(payloadHash({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(payloadHash({ b: { d: [1, 2], c: 2 }, a: 1 }))
    expect(stableStringify({ x: undefined, y: 1 })).toBe('{"y":1}')
  })

  it('idempotência: id do provedor vence o hash e é isolado por loja/canal', () => {
    const k1 = eventKey('loja1:canalA', 'lead-99', { nome: 'A' })
    const k2 = eventKey('loja1:canalA', 'lead-99', { nome: 'B (reenvio editado)' })
    expect(k1).toBe(k2)
    expect(eventKey('loja2:canalA', 'lead-99', {})).not.toBe(k1)
    expect(eventKey('loja1:canalA', null, { nome: 'A' })).toBe(eventKey('loja1:canalA', '', { nome: 'A' }))
    expect(eventKey('loja1:canalA', null, { nome: 'A' })).not.toBe(eventKey('loja1:canalA', null, { nome: 'B' }))
  })

  it('espera crescente e esgota depois do máximo de tentativas', () => {
    const now = new Date('2026-10-07T12:00:00Z')
    expect(nextAttemptAt(1, now)!.getTime() - now.getTime()).toBe(60_000)
    expect(nextAttemptAt(3, now)!.getTime() - now.getTime()).toBe(5 * 60_000)
    expect(nextAttemptAt(7, now)!.getTime() - now.getTime()).toBe(180 * 60_000)
    expect(nextAttemptAt(MAX_ATTEMPTS, now)).toBeNull()
  })

  it('identificador legível do evento', () => {
    expect(correlationId('cmabcdef1234wxyz', new Date('2026-03-01T00:00:00Z'))).toBe('EVT-2026-1234WXYZ')
  })

  it('mascara segredos e documentos na tela técnica', () => {
    const m = maskPayload({ nome: 'João', cpf: '12345678900', auth: { token: 'abc', apiKey: 'x' }, lista: [{ password: 'p' }] }) as Record<string, any>
    expect(m.nome).toBe('João')
    expect(m.cpf).toBe('••••••')
    expect(m.auth.token).toBe('••••••')
    expect(m.auth.apiKey).toBe('••••••')
    expect(m.lista[0].password).toBe('••••••')
  })

  it('não guarda as chaves de autenticação no corpo bruto', () => {
    expect(stripAuthKeys({ nome: 'A', google_key: 'k', Token: 't' })).toEqual({ nome: 'A' })
  })
})
