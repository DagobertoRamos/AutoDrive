// =============================================================================
// finance/doc-storage.ts — armazenamento de arquivos de documentos do F&I.
// Mesmo padrão dos anexos de avaliação/negociação: filesystem local em
// `public/uploads/financing/{proposalId}/` por padrão; abstração pluggável p/
// S3/R2/Supabase no futuro (sem alterar rotas).
// SEGURANÇA: whitelist de MIME, limite de tamanho, nome único (anti-colisão),
// sanitização do filename (anti path-traversal). Para PII em produção,
// recomenda-se backend privado (ver EVAL_STORAGE_BACKEND/adapters).
// =============================================================================

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const MAX_BYTES = Number(process.env.FINANCE_DOC_MAX_BYTES ?? 20 * 1024 * 1024) // 20 MB

const ALLOWED_MIME: Record<string, true> = {
  'image/jpeg': true, 'image/jpg': true, 'image/png': true, 'image/webp': true,
  'image/heic': true, 'image/heif': true, 'application/pdf': true,
}

export interface SavedDoc { storageKey: string; publicUrl: string; fileName: string; fileSize: number; mimeType: string }
export interface DocValidation { ok: boolean; error?: string }

export function validateDocUpload(mimeType: string, size: number): DocValidation {
  if (!ALLOWED_MIME[(mimeType ?? '').toLowerCase()]) return { ok: false, error: 'Tipo não permitido. Aceitos: JPG/PNG/WEBP/HEIC e PDF.' }
  if (!size || size <= 0) return { ok: false, error: 'Arquivo vazio.' }
  if (size > MAX_BYTES) return { ok: false, error: `Arquivo acima do limite de ${Math.round(MAX_BYTES / (1024 * 1024))} MB.` }
  return { ok: true }
}

function sanitizeFilename(input: string): string {
  const base = path.basename(input || 'arquivo')
  return base.replace(/[^\w\d.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'arquivo'
}

const ROOT = path.join(process.cwd(), 'public', 'uploads', 'financing')

export async function saveFinanceDoc(proposalId: string, filename: string, mime: string, bytes: Buffer): Promise<SavedDoc> {
  const safe = sanitizeFilename(filename)
  const id = randomBytes(8).toString('hex')
  const dir = path.join(ROOT, proposalId)
  await fs.mkdir(dir, { recursive: true })
  const finalName = `${id}_${safe}`
  await fs.writeFile(path.join(dir, finalName), bytes)
  const storageKey = `financing/${proposalId}/${finalName}`
  return { storageKey, publicUrl: `/uploads/${storageKey}`, fileName: safe, fileSize: bytes.length, mimeType: mime }
}

export async function deleteFinanceDoc(publicUrlOrKey: string | null | undefined): Promise<void> {
  if (!publicUrlOrKey || publicUrlOrKey.includes('..')) return
  const key = publicUrlOrKey.replace(/^\/uploads\//, '')
  await fs.unlink(path.join(process.cwd(), 'public', 'uploads', key)).catch(() => { /* ignore */ })
}
