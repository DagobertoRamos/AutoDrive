// =============================================================================
// Testes da assinatura de gravação (URL curta) e da guarda anti-SSRF.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signPlayToken, verifyPlayToken, buildSignedPlayPath, isSafeExternalUrl, resolveRecordingSource } from './recording-storage'

const OLD = process.env.TELEPHONY_RECORDING_SIGNING_SECRET
const OLD_HOSTS = process.env.TELEPHONY_RECORDING_ALLOWED_HOSTS
const OLD_ENDPOINT = process.env.TELEPHONY_STORAGE_ENDPOINT
const OLD_BUCKET = process.env.TELEPHONY_STORAGE_BUCKET

beforeAll(() => {
  process.env.TELEPHONY_RECORDING_SIGNING_SECRET = 'test-signing-secret-abcdef 1234567'
  delete process.env.TELEPHONY_STORAGE_ENDPOINT
  delete process.env.TELEPHONY_STORAGE_BUCKET
})
afterAll(() => {
  if (OLD === undefined) delete process.env.TELEPHONY_RECORDING_SIGNING_SECRET; else process.env.TELEPHONY_RECORDING_SIGNING_SECRET = OLD
  if (OLD_HOSTS === undefined) delete process.env.TELEPHONY_RECORDING_ALLOWED_HOSTS; else process.env.TELEPHONY_RECORDING_ALLOWED_HOSTS = OLD_HOSTS
  if (OLD_ENDPOINT === undefined) delete process.env.TELEPHONY_STORAGE_ENDPOINT; else process.env.TELEPHONY_STORAGE_ENDPOINT = OLD_ENDPOINT
  if (OLD_BUCKET === undefined) delete process.env.TELEPHONY_STORAGE_BUCKET; else process.env.TELEPHONY_STORAGE_BUCKET = OLD_BUCKET
})

describe('assinatura de gravação', () => {
  const now = 1_700_000_000_000

  it('valida token correto dentro da validade', () => {
    const exp = Math.floor(now / 1000) + 300
    const sig = signPlayToken('rec1', exp)
    expect(verifyPlayToken('rec1', exp, sig, now)).toBe(true)
  })

  it('rejeita token expirado', () => {
    const exp = Math.floor(now / 1000) - 1
    const sig = signPlayToken('rec1', exp)
    expect(verifyPlayToken('rec1', exp, sig, now)).toBe(false)
  })

  it('rejeita assinatura adulterada ou id trocado', () => {
    const exp = Math.floor(now / 1000) + 300
    const sig = signPlayToken('rec1', exp)
    expect(verifyPlayToken('rec1', exp, sig + 'x', now)).toBe(false)
    expect(verifyPlayToken('rec2', exp, sig, now)).toBe(false)
  })

  it('buildSignedPlayPath gera caminho assinado verificável', () => {
    const { path, exp } = buildSignedPlayPath('rec9', 300, now)
    const sig = new URL('http://x' + path).searchParams.get('sig')!
    expect(path).toContain('/recordings/rec9/stream')
    expect(verifyPlayToken('rec9', exp, sig, now)).toBe(true)
  })
})

describe('guarda anti-SSRF', () => {
  it('bloqueia http, hosts privados e fora da allowlist', () => {
    process.env.TELEPHONY_RECORDING_ALLOWED_HOSTS = 'api.twilio.com'
    expect(isSafeExternalUrl('http://api.twilio.com/x.mp3')).toBe(false)   // não-https
    expect(isSafeExternalUrl('https://localhost/x')).toBe(false)
    expect(isSafeExternalUrl('https://10.0.0.5/x')).toBe(false)
    expect(isSafeExternalUrl('https://evil.com/x.mp3')).toBe(false)        // fora da allowlist
    expect(isSafeExternalUrl('https://api.twilio.com/x.mp3')).toBe(true)
    expect(isSafeExternalUrl('https://media.api.twilio.com/x.mp3')).toBe(true) // subdomínio
  })

  it('sem allowlist, não faz proxy (unavailable)', () => {
    delete process.env.TELEPHONY_RECORDING_ALLOWED_HOSTS
    expect(resolveRecordingSource('https://api.twilio.com/x.mp3').kind).toBe('unavailable')
    expect(resolveRecordingSource(null).kind).toBe('unavailable')
  })
})
