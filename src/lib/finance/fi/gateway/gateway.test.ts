import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { CONNECTION_META, connectionState, currentFiEnvironment, getBankProvider, listBankProviders } from './registry'
import { BVAdapter } from './banks'
import { isSandboxAllowed, priceInstallment } from './sandbox'
import { BankGatewayError } from './types'

const ctx = { tenantId: 't1', environment: 'HOMOLOGACAO' as const, credentials: { clientId: 'x' }, correlationId: 'c' }

describe('gateway de bancos', () => {
  it('bancos sem API oficial respondem "Banco ainda não integrado" (sem integração falsa)', async () => {
    const bv = new BVAdapter()
    expect(bv.official).toBe(false)
    expect(bv.isIntegrated(ctx)).toBe(false)
    await expect(bv.submitProposal({ personType: 'PF', data: {} }, { vehicleValue: 1, downPayment: 0, amount: 1, installments: 12 }, ctx))
      .rejects.toMatchObject({ code: 'NAO_INTEGRADO', message: 'Banco ainda não integrado.' })
  })
  it('todos os conectores previstos existem atrás da mesma interface', () => {
    for (const k of ['bv', 'pan', 'santander', 'itau', 'safra', 'c6', 'bradesco', 'daycoval', 'agregador']) {
      expect(getBankProvider(k)?.key).toBe(k)
    }
    expect(getBankProvider('agregador')?.channel).toBe('AGREGADOR')
    expect(getBankProvider(null)).toBeNull()
  })
  it('estado de conexão é honesto', () => {
    const bv = getBankProvider('bv')!
    const base = { adapterKey: 'bv', provider: bv, hasCredential: true, credentialReadable: true, credentialExpiresAt: null, integrated: false }
    expect(connectionState({ ...base, adapterKey: null, provider: null })).toBe('NAO_CONECTADO')
    // Credencial cadastrada não transforma banco sem API oficial em "Conectado".
    expect(connectionState(base)).toBe('NAO_INTEGRADO')
    expect(CONNECTION_META.NAO_INTEGRADO.label).toBe('Banco ainda não integrado')
  })
  it('conector oficial: credencial vencida, ilegível ou ausente', () => {
    const official = { ...getBankProvider('pan')!, official: true } as never
    const base = { adapterKey: 'pan', provider: official, hasCredential: true, credentialReadable: true, credentialExpiresAt: null, integrated: true }
    expect(connectionState(base)).toBe('CONECTADO')
    expect(connectionState({ ...base, hasCredential: false })).toBe('CONFIGURACAO_NECESSARIA')
    expect(connectionState({ ...base, credentialReadable: false })).toBe('CREDENCIAL_INVALIDA')
    expect(connectionState({ ...base, credentialExpiresAt: new Date(Date.now() - 1000) })).toBe('CREDENCIAL_VENCIDA')
  })
  it('produção nunca usa credencial de homologação nem banco de testes', () => {
    expect(currentFiEnvironment({ VERCEL_ENV: 'production' } as never)).toBe('PRODUCAO')
    expect(currentFiEnvironment({ NODE_ENV: 'development' } as never)).toBe('HOMOLOGACAO')
    expect(isSandboxAllowed({ VERCEL_ENV: 'production', FI_SANDBOX: '1', NODE_ENV: 'production' } as never)).toBe(false)
    expect(isSandboxAllowed({ NODE_ENV: 'production' } as never)).toBe(false)
    expect(isSandboxAllowed({ NODE_ENV: 'test' } as never)).toBe(true)
  })
  it('banco de testes só aparece fora de produção', () => {
    expect(listBankProviders().some((p) => p.key === 'teste')).toBe(true) // NODE_ENV=test
  })
  it('assinatura de webhook HMAC (rejeita adulteração)', () => {
    const bv = new BVAdapter()
    const body = JSON.stringify({ status: 'aprovada' })
    const sig = createHmac('sha256', 'segredo-123').update(body).digest('hex')
    expect(bv.verifyWebhook(body, { 'x-signature': sig }, 'segredo-123')).toBe(true)
    expect(bv.verifyWebhook(body + ' ', { 'x-signature': sig }, 'segredo-123')).toBe(false)
    expect(bv.verifyWebhook(body, {}, 'segredo-123')).toBe(false)
  })
  it('erro de gateway informa se o pedido pode ter chegado', () => {
    expect(new BankGatewayError('x', 'TEMPO_ESGOTADO', 'TALVEZ').delivered).toBe('TALVEZ')
    expect(new BankGatewayError('x', 'INDISPONIVEL').delivered).toBe('NAO')
  })
  it('tabela Price', () => {
    expect(priceInstallment(10000, 0, 10)).toBe(1000)
    expect(priceInstallment(80000, 1.79, 48)).toBeGreaterThan(2300)
  })
})
