// =============================================================================
// Testes da camada de storage de gravações (vários provedores).
// S3 presign (determinístico/estrutural), parse de referência e registry.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseS3Ref, presignGet, listStorageProviders, resolveRecordingSource } from './index'

const ENV_KEYS = ['TELEPHONY_STORAGE_ENDPOINT', 'TELEPHONY_STORAGE_REGION', 'TELEPHONY_STORAGE_BUCKET', 'TELEPHONY_STORAGE_ACCESS_KEY_ID', 'TELEPHONY_STORAGE_SECRET_ACCESS_KEY', 'TELEPHONY_STORAGE_FORCE_PATH_STYLE'] as const
const saved: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.TELEPHONY_STORAGE_ENDPOINT = 'https://s3.us-east-1.amazonaws.com'
  process.env.TELEPHONY_STORAGE_REGION = 'us-east-1'
  process.env.TELEPHONY_STORAGE_BUCKET = 'recs'
  process.env.TELEPHONY_STORAGE_ACCESS_KEY_ID = 'AKIAEXAMPLE'
  process.env.TELEPHONY_STORAGE_SECRET_ACCESS_KEY = 'secretExampleKey/1234567890'
  process.env.TELEPHONY_STORAGE_FORCE_PATH_STYLE = 'true'
})
afterAll(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]! }
})

const CFG = {
  endpoint: 'https://s3.us-east-1.amazonaws.com', region: 'us-east-1', bucket: 'recs',
  accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secretExampleKey/1234567890', forcePathStyle: true,
}

describe('parseS3Ref', () => {
  it('separa bucket/key de s3://', () => {
    expect(parseS3Ref('s3://b1/path/x.mp3', 'def')).toEqual({ bucket: 'b1', key: 'path/x.mp3' })
  })
  it('usa bucket default para chave crua', () => {
    expect(parseS3Ref('path/x.mp3', 'def')).toEqual({ bucket: 'def', key: 'path/x.mp3' })
  })
  it('rejeita outro esquema', () => {
    expect(parseS3Ref('https://x/y', 'def')).toBeNull()
  })
})

describe('presignGet (SigV4)', () => {
  const now = 1_700_000_000_000
  it('gera URL com parâmetros SigV4 e assinatura de 64 hex', () => {
    const url = presignGet(CFG, 'recs', 'calls/abc.mp3', 300, now)
    const u = new URL(url)
    expect(u.host).toBe('s3.us-east-1.amazonaws.com')
    expect(u.pathname).toBe('/recs/calls/abc.mp3')
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(u.searchParams.get('X-Amz-Credential')).toContain('AKIAEXAMPLE/')
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })
  it('é determinístico p/ mesmas entradas e muda com a chave', () => {
    const a = presignGet(CFG, 'recs', 'k.mp3', 300, now)
    const b = presignGet(CFG, 'recs', 'k.mp3', 300, now)
    const c = presignGet({ ...CFG, secretAccessKey: 'outra-chave-1234567890' }, 'recs', 'k.mp3', 300, now)
    expect(a).toBe(b)
    expect(new URL(a).searchParams.get('X-Amz-Signature')).not.toBe(new URL(c).searchParams.get('X-Amz-Signature'))
  })
  it('virtual-host style move o bucket p/ o host', () => {
    const url = presignGet({ ...CFG, forcePathStyle: false }, 'recs', 'k.mp3', 300, now)
    expect(new URL(url).host).toBe('recs.s3.us-east-1.amazonaws.com')
  })
})

describe('registry', () => {
  it('lista providers (s3 + external)', () => {
    const kinds = listStorageProviders().map((p) => p.kind)
    expect(kinds).toContain('s3')
    expect(kinds).toContain('external')
  })
  it('resolve s3:// como redirect presignado', () => {
    const src = resolveRecordingSource('s3://recs/calls/x.mp3', 300, 1_700_000_000_000)
    expect(src.kind).toBe('redirect')
    if (src.kind === 'redirect') expect(src.url).toContain('X-Amz-Signature=')
  })
})
