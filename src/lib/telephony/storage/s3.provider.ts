// =============================================================================
// telephony/storage/s3.provider.ts — storage S3-COMPATÍVEL (presign GET SigV4).
// Cobre AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, Wasabi, Backblaze B2.
// Gera uma URL pré-assinada de curta duração → servida via redirect (302).
// Presign é puramente criptográfico (sem rede). Sem SDK (evita dependência).
//
// Config (env): TELEPHONY_STORAGE_ENDPOINT, _REGION, _BUCKET,
//   _ACCESS_KEY_ID, _SECRET_ACCESS_KEY, _FORCE_PATH_STYLE (default true).
// Referência: `s3://bucket/key` ou apenas `key` (usa o bucket configurado).
// =============================================================================

import crypto from 'node:crypto'
import type { RecordingStorageProvider, PlaybackSource } from './types'

interface S3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

function readConfig(): S3Config | null {
  const endpoint = process.env.TELEPHONY_STORAGE_ENDPOINT
  const bucket = process.env.TELEPHONY_STORAGE_BUCKET
  const accessKeyId = process.env.TELEPHONY_STORAGE_ACCESS_KEY_ID
  const secretAccessKey = process.env.TELEPHONY_STORAGE_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null
  return {
    endpoint, bucket, accessKeyId, secretAccessKey,
    region: process.env.TELEPHONY_STORAGE_REGION || 'us-east-1',
    forcePathStyle: process.env.TELEPHONY_STORAGE_FORCE_PATH_STYLE !== 'false',
  }
}

// Codificação RFC3986 (AWS). Segmentos de path preservam '/'.
function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}
function encPath(key: string): string {
  return key.split('/').map(enc).join('/')
}
function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}
function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function amzDates(nowMs: number): { amzdate: string; datestamp: string } {
  const iso = new Date(nowMs).toISOString() // 2023-01-01T00:00:00.000Z
  const amzdate = iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return { amzdate, datestamp: amzdate.slice(0, 8) }
}

/** Parseia `s3://bucket/key` ou `key` (bucket default). */
export function parseS3Ref(ref: string, defaultBucket: string): { bucket: string; key: string } | null {
  if (ref.startsWith('s3://')) {
    const rest = ref.slice('s3://'.length)
    const i = rest.indexOf('/')
    if (i <= 0) return null
    return { bucket: rest.slice(0, i), key: rest.slice(i + 1) }
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) return null // outro esquema
  return { bucket: defaultBucket, key: ref.replace(/^\/+/, '') }
}

/** Gera URL pré-assinada (SigV4) para um método. `nowMs` injetável p/ testes. */
export function presign(method: 'GET' | 'PUT', cfg: S3Config, bucket: string, key: string, ttlSeconds: number, nowMs: number): string {
  const ep = new URL(cfg.endpoint)
  const host = cfg.forcePathStyle ? ep.host : `${bucket}.${ep.host}`
  const path = cfg.forcePathStyle ? `/${enc(bucket)}/${encPath(key)}` : `/${encPath(key)}`
  const { amzdate, datestamp } = amzDates(nowMs)
  const scope = `${datestamp}/${cfg.region}/s3/aws4_request`

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': amzdate,
    'X-Amz-Expires': String(ttlSeconds),
    'X-Amz-SignedHeaders': 'host',
  }
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&')
  const canonicalRequest = [method, path, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzdate, scope, sha256hex(canonicalRequest)].join('\n')

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, datestamp)
  const kRegion = hmac(kDate, cfg.region)
  const kService = hmac(kRegion, 's3')
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  return `${ep.protocol}//${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

/** Compat: presign de GET. */
export function presignGet(cfg: S3Config, bucket: string, key: string, ttlSeconds: number, nowMs: number): string {
  return presign('GET', cfg, bucket, key, ttlSeconds, nowMs)
}

export class S3StorageProvider implements RecordingStorageProvider {
  readonly kind = 's3'
  get ready(): boolean { return readConfig() !== null }
  get writable(): boolean { return this.ready }

  canHandle(ref: string): boolean {
    if (ref.startsWith('s3://')) return true
    // chave "crua" (sem esquema) só é nossa se o S3 estiver configurado
    return this.ready && !/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)
  }

  getPlayback(ref: string, ttlSeconds: number, nowMs: number = Date.now()): PlaybackSource {
    const cfg = readConfig()
    if (!cfg) return { kind: 'unavailable', reason: 'Storage S3 não configurado (defina TELEPHONY_STORAGE_*).' }
    const parsed = parseS3Ref(ref, cfg.bucket)
    if (!parsed) return { kind: 'unavailable', reason: 'Referência de gravação inválida para S3.' }
    return { kind: 'redirect', url: presignGet(cfg, parsed.bucket, parsed.key, ttlSeconds, nowMs) }
  }

  /** Sobe os bytes via PUT pré-assinado e devolve a referência `s3://bucket/key`. */
  async putObject(key: string, body: Uint8Array, contentType: string): Promise<string> {
    const cfg = readConfig()
    if (!cfg) throw new Error('Storage S3 não configurado.')
    const url = presign('PUT', cfg, cfg.bucket, key, 300, Date.now())
    // undici aceita Uint8Array como corpo; o cast contorna a divergência de lib (ArrayBufferLike).
    const res = await fetch(url, { method: 'PUT', body: body as unknown as BodyInit, headers: { 'content-type': contentType } })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Falha ao enviar para o storage (${res.status}). ${detail.slice(0, 200)}`)
    }
    return `s3://${cfg.bucket}/${key}`
  }
}
