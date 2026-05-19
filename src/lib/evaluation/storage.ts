// =============================================================================
// Storage para anexos de Avaliação.
// Estratégia:
//   - Em desenvolvimento e por padrão: filesystem local em `public/uploads/evaluations`.
//     A URL pública vira `/uploads/evaluations/{evalId}/{fileId}_{filename}`.
//   - Em produção: adapter pluggable (S3/R2/Supabase) — controlado por env.
//     Hoje implementamos só o LOCAL, mas a abstração permite trocar sem mexer em rotas.
//
// SEGURANÇA:
//   - Valida MIME type (whitelist).
//   - Valida tamanho máximo (20 MB padrão).
//   - Gera nome único (cuid()) para evitar colisão.
//   - Sanitiza filename original (remove path traversal).
//   - Salva metadados no PostgreSQL via EvaluationAttachment.
// =============================================================================

import { promises as fs }   from 'node:fs'
import path                 from 'node:path'
import { randomBytes }      from 'node:crypto'

const MAX_BYTES = Number(process.env.EVAL_UPLOAD_MAX_BYTES ?? 20 * 1024 * 1024) // 20 MB

const ALLOWED_MIME: Record<string, 'image' | 'pdf'> = {
  'image/jpeg':       'image',
  'image/jpg':        'image',
  'image/png':        'image',
  'image/webp':       'image',
  'image/heic':       'image',
  'image/heif':       'image',
  'application/pdf':  'pdf',
}

export interface SavedAttachment {
  storageKey: string   // chave persistida (path relativo dentro do storage)
  publicUrl:  string   // URL pública/HTTP para o frontend
  fileType:   'image' | 'pdf' | 'other'
  mimeType:   string
  fileSize:   number
  fileName:   string
}

export interface ValidationResult {
  ok:    boolean
  error?: string
  fileType?: 'image' | 'pdf'
}

/** Valida MIME e tamanho. Não lê o conteúdo. */
export function validateUpload(mimeType: string, size: number): ValidationResult {
  const ft = ALLOWED_MIME[mimeType?.toLowerCase()]
  if (!ft) {
    return { ok: false, error: 'Tipo de arquivo não permitido. Aceitos: JPG/PNG/WEBP/HEIC e PDF.' }
  }
  if (!size || size <= 0) {
    return { ok: false, error: 'Arquivo vazio.' }
  }
  if (size > MAX_BYTES) {
    const mb = Math.round(MAX_BYTES / (1024 * 1024))
    return { ok: false, error: `Arquivo acima do limite de ${mb} MB.` }
  }
  return { ok: true, fileType: ft }
}

/** Remove caracteres perigosos e normaliza para storage. */
function sanitizeFilename(input: string): string {
  const base = path.basename(input || 'arquivo')
  return base
    .replace(/[^\w\d.\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'arquivo'
}

/** Gera um id curto para o arquivo (URL-safe). */
function shortId(): string {
  return randomBytes(8).toString('hex')
}

// ── Backend: LOCAL FS (padrão) ────────────────────────────────────────────────

const ROOT = path.join(process.cwd(), 'public', 'uploads', 'evaluations')

async function saveLocal(
  evalId: string,
  filename: string,
  mime: string,
  bytes: Buffer,
): Promise<SavedAttachment> {
  const safe = sanitizeFilename(filename)
  const id   = shortId()
  const dir  = path.join(ROOT, evalId)
  await fs.mkdir(dir, { recursive: true })
  const finalName = `${id}_${safe}`
  const full      = path.join(dir, finalName)
  await fs.writeFile(full, bytes)
  const storageKey = `evaluations/${evalId}/${finalName}`
  const publicUrl  = `/uploads/${storageKey}`
  return {
    storageKey,
    publicUrl,
    fileType: ALLOWED_MIME[mime.toLowerCase()] ?? 'other',
    mimeType: mime,
    fileSize: bytes.length,
    fileName: safe,
  }
}

async function deleteLocal(storageKey: string): Promise<void> {
  if (!storageKey || storageKey.includes('..')) return  // segurança extra
  const full = path.join(process.cwd(), 'public', 'uploads', storageKey)
  await fs.unlink(full).catch(() => { /* ignore */ })
}

// ── API pública ───────────────────────────────────────────────────────────────

export type StorageBackend = 'local' | 's3' | 'r2' | 'supabase'

export function activeStorageBackend(): StorageBackend {
  const v = (process.env.EVAL_STORAGE_BACKEND ?? 'local').toLowerCase()
  if (v === 's3' || v === 'r2' || v === 'supabase') return v as StorageBackend
  return 'local'
}

/**
 * Salva um anexo. Hoje suporta apenas LOCAL.
 * Adapters S3/R2/Supabase podem ser plugados aqui sem alterar rotas.
 */
export async function saveAttachment(
  evalId: string,
  filename: string,
  mime: string,
  bytes: Buffer,
): Promise<SavedAttachment> {
  const backend = activeStorageBackend()
  if (backend === 'local') return saveLocal(evalId, filename, mime, bytes)
  // TODO: implementar adapters S3/R2/Supabase no futuro.
  throw new Error(`Storage backend "${backend}" ainda não implementado neste build.`)
}

/** Deleta arquivo do storage (não falha se não achar). */
export async function deleteAttachment(storageKey: string): Promise<void> {
  const backend = activeStorageBackend()
  if (backend === 'local') return deleteLocal(storageKey)
  // TODO: adapters cloud
}
