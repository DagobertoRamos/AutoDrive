// Apps da plataforma: segredo cifrado e teste oficial (respostas SIMULADAS).
import { describe, expect, it } from 'vitest'
import { createHttpClient } from './connectors/http'
import { sealIfPublication, testPlatformApp } from './platform-apps'
import { decrypt, isEncrypted } from '@/lib/crypto'

const http = (status: number, body: unknown) => createHttpClient(async () => new Response(JSON.stringify(body), { status }))

describe('apps da plataforma (SIMULAÇÃO)', () => {
  it('cifra só o segredo dos apps de publicação', () => {
    const s = sealIfPublication('PUB_META', 'segredo')!
    expect(isEncrypted(s)).toBe(true); expect(decrypt(s)).toBe('segredo')
    expect(sealIfPublication('PLATE_LOOKUP', 'x')).toBe('x')
    expect(sealIfPublication('PUB_OLX', null)).toBeNull()
  })
  it('Meta: token de app aceito = válido; recusado = mensagem da Meta', async () => {
    const sec = sealIfPublication('PUB_META', 's')
    expect((await testPlatformApp('PUB_META', 'id', sec, http(200, { access_token: 'x' }))).ok).toBe(true)
    const r = await testPlatformApp('PUB_META', 'id', sec, http(400, { error: { message: 'Error validating client secret.' } }))
    expect(r.ok).toBe(false); expect(r.message).toMatch(/client secret/)
  })
  it('Mercado Livre: invalid_client é recusa clara', async () => {
    const sec = sealIfPublication('PUB_MERCADO_LIVRE', 's')
    expect((await testPlatformApp('PUB_MERCADO_LIVRE', 'id', sec, http(200, { access_token: 'x' }))).ok).toBe(true)
    expect((await testPlatformApp('PUB_MERCADO_LIVRE', 'id', sec, http(400, { error: 'invalid_client' }))).message).toMatch(/invalid_client/)
  })
  it('sem ID/segredo não testa', async () => {
    expect((await testPlatformApp('PUB_OLX', null, null)).ok).toBe(false)
  })
})
