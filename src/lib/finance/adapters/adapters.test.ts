// =============================================================================
// Testes da camada de adapters do F&I (Fase 5 — só estrutura).
// Garante: resolução por kind, Manual operante/seguro, demais bloqueados sem
// integração oficial, e operações não suportadas falhando explicitamente.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { getAdapter, resolveAdapterForProvider } from './registry'
import { ManualAdapter } from './manual'
import { CredereAdapter } from './credere'
import { GenericBankAdapter } from './generic-bank'
import { AdapterNotConfiguredError, AdapterNotSupportedError, type AdapterContext } from './types'

const ctx: AdapterContext = { tenantId: 't1', environment: 'HOMOLOGACAO' }

describe('registry', () => {
  it('resolve cada kind para o adapter correto', () => {
    expect(getAdapter('MANUAL')).toBeInstanceOf(ManualAdapter)
    expect(getAdapter('OUTRO')).toBeInstanceOf(ManualAdapter)
    expect(getAdapter('CREDERE')).toBeInstanceOf(CredereAdapter)
    expect(getAdapter('BANCO_DIRETO')).toBeInstanceOf(GenericBankAdapter)
    expect(getAdapter('INTEGRADOR')).toBeInstanceOf(GenericBankAdapter)
  })
  it('resolveAdapterForProvider usa o kind do provider', () => {
    expect(resolveAdapterForProvider({ kind: 'MANUAL' })).toBeInstanceOf(ManualAdapter)
  })
})

describe('ManualAdapter', () => {
  const a = new ManualAdapter()
  it('está sempre pronto e não automatiza', () => {
    expect(a.isReady(ctx)).toBe(true)
    expect(a.capabilities.webhook).toBe(false)
  })
  it('simula vazio (manual=true)', async () => {
    const r = await a.simulate({}, ctx)
    expect(r.manual).toBe(true)
    expect(r.options).toEqual([])
  })
  it('submit registra manualmente sem externalId', async () => {
    const r = await a.submit({ proposalId: 'p1', proponent: {} }, ctx)
    expect(r.source).toBe('MANUAL')
    expect(r.externalId).toBeNull()
    expect(r.status).toBe('ENVIADA')
  })
  it('parseWebhook não é suportado', async () => {
    await expect(a.parseWebhook({}, {}, ctx)).rejects.toBeInstanceOf(AdapterNotSupportedError)
  })
})

describe('CredereAdapter (preparado, não configurado)', () => {
  const a = new CredereAdapter()
  it('não está pronto', () => { expect(a.isReady(ctx)).toBe(false) })
  it('bloqueia operações com NotConfigured', async () => {
    await expect(a.simulate({}, ctx)).rejects.toBeInstanceOf(AdapterNotConfiguredError)
    await expect(a.submit({ proposalId: 'p1', proponent: {} }, ctx)).rejects.toBeInstanceOf(AdapterNotConfiguredError)
    await expect(a.getStatus('x', ctx)).rejects.toBeInstanceOf(AdapterNotConfiguredError)
    await expect(a.parseWebhook({}, {}, ctx)).rejects.toBeInstanceOf(AdapterNotConfiguredError)
  })
})

describe('GenericBankAdapter (molde de API oficial)', () => {
  const a = new GenericBankAdapter('BANCO_DIRETO')
  it('não está pronto e recusa operar sem config', async () => {
    expect(a.isReady(ctx)).toBe(false)
    await expect(a.submit({ proposalId: 'p1', proponent: {} }, ctx)).rejects.toBeInstanceOf(AdapterNotConfiguredError)
  })
  it('mesmo com baseUrl+credenciais segue não configurado (falta mapeamento)', async () => {
    const full: AdapterContext = { ...ctx, baseUrl: 'https://api.banco.example', credentials: { token: 'x' } }
    await expect(a.simulate({}, full)).rejects.toBeInstanceOf(AdapterNotConfiguredError)
  })
})
