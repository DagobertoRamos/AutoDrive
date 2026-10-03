// =============================================================================
// Storage para anexos de Negociação (comprovantes, contratos, NFe, recibos).
// Mesma estratégia do storage de avaliações: filesystem local em
// `public/uploads/deals` por padrão. Trocar backend via env DEAL_STORAGE_BACKEND.
// =============================================================================

import { promises as fs }   from 'node:fs'
import path                 from 'node:path'
import { randomBytes }      from 'node:crypto'

const MAX_BYTES = Number(process.env.DEAL_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024) // 25 MB

const ALLOWED_MIME: Record<string, 'image' | 'pdf' | 'xml'> = {
  'image/jpeg':       'image',
  'image/jpg':        'image',
  'image/png':        'image',
  'image/webp':       'image',
  'image/heic':       'image',
  'image/heif':       'image',
  'application/pdf':  'pdf',
  'text/xml':         'xml',  // NFe
  'application/xml':  'xml',
}

export interface SavedDealAttachment {
  storageKey: string
  publicUrl:  string
  fileType:   'image' | 'pdf' | 'xml' | 'other'
  mimeType:   string
  fileSize:   number
  fileName:   string
}

export interface ValidationResult {
  ok: boolean
  error?: string
  fileType?: 'image' | 'pdf' | 'xml'
}

export function validateDealUpload(mimeType: string, size: number): ValidationResult {
  const ft = ALLOWED_MIME[mimeType?.toLowerCase()]
  if (!ft) {
    return { ok: false, error: 'Tipo de arquivo não permitido. Aceitos: JPG/PNG/WEBP/HEIC, PDF e XML (NFe).' }
  }
  if (!size || size <= 0) return { ok: false, error: 'Arquivo vazio.' }
  if (size > MAX_BYTES) {
    const mb = Math.round(MAX_BYTES / (1024 * 1024))
    return { ok: false, error: `Arquivo acima do limite de ${mb} MB.` }
  }
  return { ok: true, fileType: ft }
}

function sanitizeFilename(input: string): string {
  const base = path.basename(input || 'arquivo')
  return base
    .replace(/[^\w\d.\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'arquivo'
}

function shortId(): string {
  return randomBytes(8).toString('hex')
}

const ROOT = path.join(process.cwd(), 'public', 'uploads', 'deals')

async function saveLocal(dealId: string, filename: string, mime: string, bytes: Buffer): Promise<SavedDealAttachment> {
  const safe = sanitizeFilename(filename)
  const id   = shortId()
  const dir  = path.join(ROOT, dealId)
  await fs.mkdir(dir, { recursive: true })
  const finalName = `${id}_${safe}`
  await fs.writeFile(path.join(dir, finalName), bytes)
  const storageKey = `deals/${dealId}/${finalName}`
  return {
    storageKey,
    publicUrl: `/uploads/${storageKey}`,
    fileType:  ALLOWED_MIME[mime.toLowerCase()] ?? 'other',
    mimeType:  mime,
    fileSize:  bytes.length,
    fileName:  safe,
  }
}

async function deleteLocal(storageKey: string): Promise<void> {
  if (!storageKey || storageKey.includes('..')) return
  const full = path.join(process.cwd(), 'public', 'uploads', storageKey)
  await fs.unlink(full).catch(() => { /* ignore */ })
}

// ── Backend: ARMAZENAMENTO DE ARQUIVOS (Vercel Blob, privado) ─────────────────
// Em produção (serverless) o disco é somente leitura e se apaga a cada deploy:
// o comprovante iria embora. Aqui vai para o Blob PRIVADO e é servido por
// rota autenticada (/api/negotiations/files), que confere o acesso à negociação.

export const BLOB_PREFIX = 'blob://'
export const fileUrl = (storageKey: string) => `/api/negotiations/files?key=${encodeURIComponent(storageKey)}`

/** Backend em uso: DEAL_STORAGE_BACKEND (local|blob); sem env, blob em serverless e local no dev. */
export function dealStorageBackend(): 'local' | 'blob' {
  const v = (process.env.DEAL_STORAGE_BACKEND ?? '').toLowerCase()
  if (v === 'local' || v === 'blob') return v
  return process.env.VERCEL || process.env.BLOB_STORE_ID ? 'blob' : 'local'
}

async function saveBlob(pathname: string, filename: string, mime: string, bytes: Buffer): Promise<SavedDealAttachment> {
  const { put } = await import('@vercel/blob')
  const { blobAuth } = await import('@/lib/publications/social/blob-token')
  await put(pathname, bytes, { access: 'private', contentType: mime, addRandomSuffix: false, ...blobAuth() })
  const storageKey = `${BLOB_PREFIX}${pathname}`
  return { storageKey, publicUrl: fileUrl(storageKey), fileType: ALLOWED_MIME[mime.toLowerCase()] ?? 'other', mimeType: mime, fileSize: bytes.length, fileName: sanitizeFilename(filename) }
}

export async function saveDealAttachment(dealId: string, filename: string, mime: string, bytes: Buffer): Promise<SavedDealAttachment> {
  if (dealStorageBackend() === 'blob') return saveBlob(`deals/${dealId}/${shortId()}_${sanitizeFilename(filename)}`, filename, mime, bytes)
  return saveLocal(dealId, filename, mime, bytes)
}

/** Pasta dos comprovantes enviados antes de a negociação existir (no modal de pagamento). */
export const pendingFolder = (tenantId: string) => `deals/pending/${tenantId}/`

/** Comprovante enviado no modal de pagamento, antes de salvar a negociação. Vinculado ao salvar. */
export async function savePendingReceipt(tenantId: string, filename: string, mime: string, bytes: Buffer): Promise<SavedDealAttachment> {
  if (dealStorageBackend() === 'blob') return saveBlob(`${pendingFolder(tenantId)}${shortId()}_${sanitizeFilename(filename)}`, filename, mime, bytes)
  return saveLocal(`pending/${tenantId}`, filename, mime, bytes)
}

/** Lê o arquivo (só para o backend blob; o local é servido direto de /uploads). */
export async function readDealFile(storageKey: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  if (!storageKey.startsWith(BLOB_PREFIX)) return null
  const { get } = await import('@vercel/blob')
  const { blobAuth } = await import('@/lib/publications/social/blob-token')
  const r = await get(storageKey.slice(BLOB_PREFIX.length), { access: 'private', ...blobAuth() })
  if (!r || r.statusCode !== 200) return null
  return { stream: r.stream, contentType: r.blob.contentType || 'application/octet-stream' }
}

export async function deleteDealAttachment(storageKey: string): Promise<void> {
  if (!storageKey) return
  if (storageKey.startsWith(BLOB_PREFIX)) {
    try {
      const { del } = await import('@vercel/blob')
      const { blobAuth } = await import('@/lib/publications/social/blob-token')
      await del(storageKey.slice(BLOB_PREFIX.length), blobAuth())
    } catch { /* já removido */ }
    return
  }
  return deleteLocal(storageKey)
}
