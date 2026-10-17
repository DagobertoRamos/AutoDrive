// =============================================================================
// Reserva pela Credere — Postgres real (mesmo banco de teste do orquestrador):
//   FI_TEST_DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_fi_test npx vitest run src/lib/finance/fi
// =============================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const DB = vi.hoisted(() => {
  const url = process.env.FI_TEST_DATABASE_URL
  if (url) { process.env.DATABASE_URL = url; process.env.DIRECT_URL = url }
  process.env.FINANCE_ENCRYPTION_KEY ||= 'chave-de-teste-fi-1234567890'
  return url
})

import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { resolveBank, viaOf } from './resolve'
import { deleteCredereConnection, findCredereConnection, patchCredereConnection, saveCredereConnection, setCredereWebhookSecret } from './credere-connection'
import { currentFiEnvironment } from './registry'

const run = randomUUID().slice(0, 8)
let tenantId = ''
const banks: Record<string, { id: string; name: string; adapterKey: string | null; code: string | null }> = {}

describe.runIf(!!DB)('Reserva pela Credere (Postgres real)', () => {
  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { publicId: `CR-${run}`, slug: `cr-${run}`, name: `Loja Credere ${run}` } })).id
    for (const [k, data] of Object.entries({
      bv: { name: 'Banco BV', adapterKey: 'bv', code: null },
      manual: { name: 'Santander', adapterKey: null, code: '033' },
      semCodigo: { name: 'Financeira Z', adapterKey: null, code: null },
    })) banks[k] = await prisma.financeBank.create({ data: { tenantId, ...data }, select: { id: true, name: true, adapterKey: true, code: true } })
  })
  afterAll(async () => {
    await prisma.financeCredential.deleteMany({ where: { tenantId } })
    await prisma.financeBank.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => null)
    await prisma.$disconnect()
  })

  it('sem Credere: banco sem conexão direta fica manual', async () => {
    const r = await resolveBank(tenantId, banks.bv)
    expect(r).toMatchObject({ via: 'DIRETO', live: false, state: 'CONFIGURACAO_NECESSARIA' })
  })

  it('com Credere conectada: banco sem conexão direta vai pela Credere com o código Febraban', async () => {
    await saveCredereConnection(tenantId, currentFiEnvironment(), { accessToken: 'tok', refreshToken: 'ref', storeId: '77', sellerCpf: '36977986859', sellerId: '411', userName: 'Fulano' }, null)
    const bv = await resolveBank(tenantId, banks.bv)
    expect(bv).toMatchObject({ via: 'CREDERE', live: true, state: 'CONECTADO' })
    expect(bv.provider?.key).toBe('credere')
    expect(bv.ctx.routedBankCode).toBe('655')
    expect((await resolveBank(tenantId, banks.manual)).ctx.routedBankCode).toBe('033')
    // Sem código Febraban conhecido não dá para rotear: segue manual.
    expect(await resolveBank(tenantId, banks.semCodigo)).toMatchObject({ via: 'DIRETO', live: false })
  })

  it('consulta de tentativa já enviada segue o canal do envio', async () => {
    expect(viaOf({ providerId: 'credere', mode: 'API' })).toBe('CREDERE')
    expect(await resolveBank(tenantId, banks.bv, undefined, 'DIRETO')).toMatchObject({ via: 'DIRETO', live: false })
    expect(await resolveBank(tenantId, banks.bv, undefined, 'CREDERE')).toMatchObject({ via: 'CREDERE', live: true })
  })

  it('webhook da Credere: com o secret da loja, só aviso assinado e recente é aceito', async () => {
    const { createHmac } = await import('node:crypto')
    process.env.FINANCE_WEBHOOK_SECRET ||= 'segredo-de-teste-com-mais-de-16'
    const { POST } = await import('@/app/api/webhook/financing/[provider]/route')
    const conn = (await findCredereConnection(tenantId, currentFiEnvironment()))!
    const body = JSON.stringify({ event: 'proposal_attempt.updated', event_id: `ev-${randomUUID()}`, proposal_attempt: { id: 999999, proposal_id: 888888 } })
    const call = (headers: Record<string, string>) => POST(new Request(`http://localhost/api/webhook/financing/credere?l=${tenantId}`, { method: 'POST', body, headers }), { params: Promise.resolve({ provider: 'credere' }) })
    const sign = (key: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', key).update(`${t}.${body}`).digest('hex')}`

    // Sem secret: aviso sem assinatura é aceito (só dispara consulta).
    expect((await call({})).status).toBe(200)
    await setCredereWebhookSecret(conn.credentialId, 'whsec_teste_loja_1')
    expect((await findCredereConnection(tenantId, currentFiEnvironment()))?.credentials.webhookSecret).toBe('whsec_teste_loja_1')
    expect((await call({})).status).toBe(401)
    expect((await call({ 'x-credere-signature': sign('outro-secret') })).status).toBe(401)
    expect((await call({ 'x-credere-signature': sign('whsec_teste_loja_1', Math.floor(Date.now() / 1000) - 600) })).status).toBe(401)
    const ok = await call({ 'x-credere-signature': sign('whsec_teste_loja_1') })
    expect(ok.status).toBe(200)
    expect((await prisma.financeWebhookEvent.findFirst({ where: { provider: 'credere', eventId: `credere:ev:${JSON.parse(body).event_id}` }, select: { signatureValid: true } }))?.signatureValid).toBe(true)
    await setCredereWebhookSecret(conn.credentialId, null)
    expect((await findCredereConnection(tenantId, currentFiEnvironment()))?.credentials.webhookSecret).toBeUndefined()
  })

  it('token renovado é gravado cifrado; desconectar volta ao manual', async () => {
    const conn = (await findCredereConnection(tenantId, currentFiEnvironment()))!
    await patchCredereConnection(conn.credentialId, { accessToken: 'novo' })
    expect((await findCredereConnection(tenantId, currentFiEnvironment()))?.credentials.accessToken).toBe('novo')
    const row = await prisma.financeCredential.findUnique({ where: { id: conn.credentialId } })
    expect(row?.secretsEncrypted).not.toContain('novo')
    expect(await deleteCredereConnection(tenantId, currentFiEnvironment())).toBe(true)
    expect((await resolveBank(tenantId, banks.bv)).via).toBe('DIRETO')
  })
})
