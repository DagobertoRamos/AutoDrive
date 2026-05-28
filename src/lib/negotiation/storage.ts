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

export async function saveDealAttachment(dealId: string, filename: string, mime: string, bytes: Buffer): Promise<SavedDealAttachment> {
  const backend = (process.env.DEAL_STORAGE_BACKEND ?? 'local').toLowerCase()
  if (backend === 'local') return saveLocal(dealId, filename, mime, bytes)
  throw new Error(`Storage backend "${backend}" ainda não implementado neste build.`)
}

export async function deleteDealAttachment(storageKey: string): Promise<void> {
  const backend = (process.env.DEAL_STORAGE_BACKEND ?? 'local').toLowerCase()
  if (backend === 'local') return deleteLocal(storageKey)
}
