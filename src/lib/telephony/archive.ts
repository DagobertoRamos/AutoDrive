// =============================================================================
// telephony/archive.ts — baixa a gravação do PROVEDOR e arquiva no SEU bucket.
// Fluxo: valida storage gerenciado + URL externa (anti-SSRF) → baixa com auth da
// conexão (timeout + limite de tamanho) → faz upload ao bucket → atualiza
// `storageUrl` para `s3://…` (gravação passa a ser sua: retenção/LGPD) → audita.
// Outbound restrito: só GET do arquivo de mídia, host em allowlist.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { TelephonyProviderKind } from '@prisma/client'
import { getManagedStorage, isSafeExternalUrl } from './storage'
import { decryptSecrets } from './crypto'

function maxBytes(): number {
  const n = Number(process.env.TELEPHONY_RECORDING_MAX_BYTES)
  return Number.isFinite(n) && n > 0 ? n : 50 * 1024 * 1024 // 50 MB
}

const EXT_BY_MIME: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm' }

function extFor(mime: string | null | undefined, url: string): string {
  if (mime && EXT_BY_MIME[mime.toLowerCase()]) return EXT_BY_MIME[mime.toLowerCase()]
  const m = url.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)
  return m ? m[1].toLowerCase() : 'mp3'
}

/** Cabeçalhos de autenticação p/ baixar do provedor, a partir das credenciais. */
export function downloadAuthHeaders(kind: TelephonyProviderKind, secrets: Record<string, string>): Record<string, string> {
  // Twilio: Basic auth AccountSid:AuthToken (doc pública).
  if (kind === 'TWILIO' && secrets.accountSid && (secrets.authToken || secrets.apiSecret)) {
    const basic = Buffer.from(`${secrets.accountSid}:${secrets.authToken || secrets.apiSecret}`).toString('base64')
    return { Authorization: `Basic ${basic}` }
  }
  if (secrets.downloadBearer) return { Authorization: `Bearer ${secrets.downloadBearer}` }
  if (secrets.downloadAuthHeader) return { Authorization: secrets.downloadAuthHeader }
  if (secrets.downloadUser && secrets.downloadPassword) {
    return { Authorization: `Basic ${Buffer.from(`${secrets.downloadUser}:${secrets.downloadPassword}`).toString('base64')}` }
  }
  return {}
}

export interface ArchiveResult {
  ok: boolean
  ref?: string
  bytes?: number
  status: 'archived' | 'already_archived' | 'skipped' | 'error'
  message?: string
}

/** Baixa e arquiva a gravação. `actorUserId` p/ auditoria (opcional). */
export async function archiveRecording(recordingId: string, actorUserId?: string | null): Promise<ArchiveResult> {
  const rec = await prisma.telephonyRecording.findUnique({
    where: { id: recordingId },
    select: { id: true, tenantId: true, status: true, storageUrl: true, mimeType: true, callId: true },
  })
  if (!rec) return { ok: false, status: 'error', message: 'Gravação não encontrada.' }
  if (rec.status === 'DELETED') return { ok: false, status: 'error', message: 'Gravação excluída.' }
  if (rec.storageUrl?.startsWith('s3://')) return { ok: true, ref: rec.storageUrl, status: 'already_archived' }

  const managed = getManagedStorage()
  if (!managed?.putObject) return { ok: false, status: 'error', message: 'Storage gerenciado não configurado (TELEPHONY_STORAGE_*).' }
  if (!rec.storageUrl || !isSafeExternalUrl(rec.storageUrl)) {
    return { ok: false, status: 'error', message: 'URL da gravação ausente ou não permitida (verifique TELEPHONY_RECORDING_ALLOWED_HOSTS).' }
  }

  // Credenciais da conexão (auth p/ baixar do provedor).
  const call = await prisma.telephonyCall.findUnique({ where: { id: rec.callId }, select: { connectionId: true } })
  let headers: Record<string, string> = {}
  if (call?.connectionId) {
    const conn = await prisma.telephonyTenantConnection.findUnique({
      where: { id: call.connectionId },
      include: { provider: { select: { kind: true } }, credentials: { select: { secretsEncrypted: true }, orderBy: { updatedAt: 'desc' }, take: 1 } },
    })
    if (conn) headers = downloadAuthHeaders(conn.provider.kind, decryptSecrets(conn.credentials[0]?.secretsEncrypted ?? null))
  }

  // Download (timeout + limite de tamanho).
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  let res: Response
  try {
    res = await fetch(rec.storageUrl, { headers, signal: ctrl.signal, redirect: 'follow' })
  } catch {
    clearTimeout(timer)
    return { ok: false, status: 'error', message: 'Falha ao baixar a gravação do provedor.' }
  }
  clearTimeout(timer)
  if (!res.ok || !res.body) return { ok: false, status: 'error', message: `Provedor respondeu ${res.status} ao baixar a gravação.` }

  const declared = Number(res.headers.get('content-length') || '0')
  if (declared && declared > maxBytes()) return { ok: false, status: 'error', message: 'Gravação excede o tamanho máximo permitido.' }

  const ab = await res.arrayBuffer()
  const bytes = new Uint8Array(ab)
  if (bytes.byteLength > maxBytes()) return { ok: false, status: 'error', message: 'Gravação excede o tamanho máximo permitido.' }

  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || rec.mimeType || 'audio/mpeg'
  const key = `tenants/${rec.tenantId}/recordings/${rec.id}.${extFor(contentType, rec.storageUrl)}`

  let ref: string
  try {
    ref = await managed.putObject(key, bytes, contentType)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha no upload.'
    await prisma.telephonyIntegrationLog.create({ data: { tenantId: rec.tenantId, action: 'RECORDING_ARCHIVE', status: 'ERROR', message: msg, createdByUserId: actorUserId ?? null } }).catch(() => {})
    return { ok: false, status: 'error', message: msg }
  }

  await prisma.telephonyRecording.update({
    where: { id: rec.id },
    data: { storageUrl: ref, status: 'AVAILABLE', mimeType: contentType, sizeBytes: bytes.byteLength },
  })
  await prisma.telephonyIntegrationLog.create({
    data: { tenantId: rec.tenantId, action: 'RECORDING_ARCHIVE', status: 'OK', message: `arquivado (${bytes.byteLength} bytes) em ${ref}`, createdByUserId: actorUserId ?? null },
  }).catch(() => {})

  return { ok: true, ref, bytes: bytes.byteLength, status: 'archived' }
}

export interface SweepResult {
  scanned: number
  archived: number
  skipped: number
  errors: number
  note?: string
  items: Array<{ id: string; status: ArchiveResult['status']; message?: string }>
}

/**
 * Varredura para o JOB automático: arquiva as gravações ainda hospedadas no
 * provedor (`storageUrl` http/https) cujo storage gerenciado já está pronto.
 * Bounded por `limit` (default 25, máx 200) para caber na janela do cron.
 */
export async function archivePendingRecordings(opts?: { limit?: number }): Promise<SweepResult> {
  const empty: SweepResult = { scanned: 0, archived: 0, skipped: 0, errors: 0, items: [] }

  if (!getManagedStorage()?.putObject) {
    return { ...empty, note: 'Storage gerenciado não configurado (TELEPHONY_STORAGE_*).' }
  }

  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 200)
  const candidates = await prisma.telephonyRecording.findMany({
    where: { status: 'AVAILABLE', storageUrl: { startsWith: 'http' } }, // ainda no provedor (não s3://)
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  const out: SweepResult = { ...empty, scanned: candidates.length, items: [] }
  for (const c of candidates) {
    const r = await archiveRecording(c.id, null)
    out.items.push({ id: c.id, status: r.status, message: r.message })
    if (r.ok && r.status === 'archived') out.archived++
    else if (r.status === 'already_archived' || r.status === 'skipped') out.skipped++
    else out.errors++
  }
  return out
}
