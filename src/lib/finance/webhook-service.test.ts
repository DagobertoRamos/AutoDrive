// =============================================================================
// Testes dos helpers puros do receptor de webhook (Fase 7b).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { secretsMatch, extractWebhookFields, mapProviderStatus } from './webhook-service'

describe('secretsMatch', () => {
  it('iguais → true; diferentes/comprimento → false', () => {
    expect(secretsMatch('abc123xy', 'abc123xy')).toBe(true)
    expect(secretsMatch('abc123xy', 'abc123xZ')).toBe(false)
    expect(secretsMatch('abc', 'abc123xy')).toBe(false)
  })
  it('vazio/nulo → false', () => {
    expect(secretsMatch('', 'x')).toBe(false)
    expect(secretsMatch('x', '')).toBe(false)
    expect(secretsMatch(null, undefined)).toBe(false)
  })
})

describe('extractWebhookFields', () => {
  it('extrai externalId/status/message de chaves comuns', () => {
    expect(extractWebhookFields({ externalId: 'A1', status: 'approved', message: 'ok' })).toEqual({ externalId: 'A1', statusRaw: 'approved', message: 'ok' })
  })
  it('aceita aliases (proposal_id, situacao, motivo)', () => {
    expect(extractWebhookFields({ proposal_id: 'B2', situacao: 'recusada', motivo: 'renda' })).toEqual({ externalId: 'B2', statusRaw: 'recusada', message: 'renda' })
  })
  it('payload vazio → tudo null', () => {
    expect(extractWebhookFields(null)).toEqual({ externalId: null, statusRaw: null, message: null })
  })
})

describe('mapProviderStatus', () => {
  it('mapeia variações para status interno', () => {
    expect(mapProviderStatus('approved')).toBe('APROVADA')
    expect(mapProviderStatus('Recusada')).toBe('RECUSADA')
    expect(mapProviderStatus('in review')).toBe('EM_ANALISE')
    expect(mapProviderStatus('PENDING')).toBe('PENDENTE')
  })
  it('aceita status já interno', () => {
    expect(mapProviderStatus('APROVADA')).toBe('APROVADA')
  })
  it('desconhecido → null', () => {
    expect(mapProviderStatus('xyz')).toBeNull()
    expect(mapProviderStatus(null)).toBeNull()
  })
})
