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
import { prisma }          from '@/lib/prisma'

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

// ── Backend: BANCO DE DADOS (obrigatório em serverless) ──────────────────────
//
// Em hospedagem serverless (Vercel) o filesystem é somente leitura: a gravação
// em public/uploads falha e a foto é perdida. Aqui os bytes vão para a tabela
// `evaluation_files` e o arquivo é servido por rota autenticada — o que também
// fecha um buraco de segurança: em public/ qualquer pessoa com a URL abria a
// foto sem sessão.

export const DB_STORAGE_PREFIX = 'db://'

async function saveDb(
  evalId: string,
  filename: string,
  mime: string,
  bytes: Buffer,
): Promise<SavedAttachment> {
  const safe = sanitizeFilename(filename)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec = await (prisma as any).evaluationFile.create({
    data: {
      evaluationId: evalId,
      fileName:     safe,
      mimeType:     mime,
      fileSize:     bytes.length,
      data:         bytes,
    },
    select: { id: true },
  })
  return {
    storageKey: `${DB_STORAGE_PREFIX}${rec.id}`,
    publicUrl:  `/api/evaluations/files/${rec.id}`,
    fileType:   ALLOWED_MIME[mime.toLowerCase()] ?? 'other',
    mimeType:   mime,
    fileSize:   bytes.length,
    fileName:   safe,
  }
}

async function deleteDb(storageKey: string): Promise<void> {
  const id = storageKey.slice(DB_STORAGE_PREFIX.length)
  if (!id) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).evaluationFile.delete({ where: { id } }).catch(() => { /* já removido */ })
}
// ── API pública ───────────────────────────────────────────────────────────────

export type StorageBackend = 'local' | 'db' | 's3' | 'r2' | 'supabase'

/**
 * Backend em uso.
 *   EVAL_STORAGE_BACKEND explícito  → manda (local | db).
 *   Sem env, rodando em serverless   → db (o disco é somente leitura lá).
 *   Sem env, rodando em servidor/dev  → local.
 */
export function activeStorageBackend(): StorageBackend {
  const v = (process.env.EVAL_STORAGE_BACKEND ?? '').toLowerCase()
  if (v === 'db' || v === 'local') return v as StorageBackend
  if (v === 's3' || v === 'r2' || v === 'supabase') return v as StorageBackend
  // Vercel/Netlify/Lambda expõem estas variáveis; nelas o FS é read-only.
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY)
  return serverless ? 'db' : 'local'
}

/**
 * Salva um anexo. Hoje suporta apenas LOCAL.
 * Adapters S3/R2/Supabase podem ser plugados aqui sem alterar rotas.
 */
/**
 * Salva um anexo. O retorno só existe quando a gravação foi CONFIRMADA —
 * quem chama só cria o registro do anexo depois disso.
 *
 * Se o backend local falhar por filesystem somente leitura, cai para o banco
 * automaticamente (em vez de perder a foto).
 */
export async function saveAttachment(
  evalId: string,
  filename: string,
  mime: string,
  bytes: Buffer,
): Promise<SavedAttachment> {
  const backend = activeStorageBackend()
  if (backend === 'db') return saveDb(evalId, filename, mime, bytes)
  if (backend === 'local') {
    try {
      return await saveLocal(evalId, filename, mime, bytes)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/EROFS|EACCES|EPERM|read-only/i.test(msg)) {
        console.warn('[storage] filesystem somente leitura — gravando o anexo no banco.')
        return saveDb(evalId, filename, mime, bytes)
      }
      throw err
    }
  }
  // TODO: implementar adapters S3/R2/Supabase no futuro.
  throw new Error(`Storage backend "${backend}" ainda não implementado neste build.`)
}

/** Deleta arquivo do storage (não falha se não achar). */
/** Deleta arquivo do storage (não falha se não achar). */
export async function deleteAttachment(storageKey: string): Promise<void> {
  if (!storageKey) return
  // A chave carrega o backend de origem — anexos antigos continuam no disco.
  if (storageKey.startsWith(DB_STORAGE_PREFIX)) return deleteDb(storageKey)
  return deleteLocal(storageKey)
}
