// =============================================================================
// Arquivos privados (NF, boleto, comprovante, contrato…): Vercel Blob PRIVADO em
// produção, disco (public/uploads/…) no dev — mesmo backend dos anexos da
// negociação. A chave guardada no banco é `blob://…` ou `/uploads/…`; a
// abertura passa sempre por uma rota autenticada.
// =============================================================================
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { BLOB_PREFIX, dealStorageBackend } from '@/lib/negotiation/storage'

export const MAX_PRIVATE_FILE_BYTES = 4 * 1024 * 1024 // corpo da requisição na Vercel ≈ 4,5 MB

const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'text/xml', 'application/xml'])

const BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', xml: 'application/xml', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
}

/** Tipo efetivo: alguns navegadores mandam XML/HEIC sem MIME — usa a extensão. */
export function effectiveMime(mime: string | null | undefined, filename: string): string {
  const m = (mime || '').toLowerCase()
  if (m && m !== 'application/octet-stream') return m
  const ext = (filename.split('.').pop() || '').toLowerCase()
  return BY_EXT[ext] || m
}

export function validatePrivateFile(mime: string, size: number): string | null {
  if (!ALLOWED.has((mime || '').toLowerCase())) return 'Tipo não permitido. Envie PDF, imagem ou XML.'
  if (!size) return 'Arquivo vazio.'
  if (size > MAX_PRIVATE_FILE_BYTES) return 'Arquivo acima de 4 MB.'
  return null
}

export const sanitizeFileName = (name: string) =>
  path.basename(name || 'arquivo').replace(/[^\w\d.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'arquivo'

/** Grava em `<folder>/<aleatório>_<nome>`; `folder` sem barras nas pontas (ex.: `finance/<tenant>/<id>`). */
export async function savePrivateFile(folder: string, filename: string, mime: string, bytes: Buffer): Promise<{ key: string; name: string }> {
  const name = sanitizeFileName(filename)
  const safeFolder = folder.split('/').map((p) => p.replace(/[^\w\d-]+/g, '_')).filter(Boolean).join('/')
  const rel = `${safeFolder}/${randomBytes(8).toString('hex')}_${name}`
  if (dealStorageBackend() === 'blob') {
    const { put } = await import('@vercel/blob')
    const { blobAuth } = await import('@/lib/publications/social/blob-token')
    await put(rel, bytes, { access: 'private', contentType: mime, addRandomSuffix: false, ...blobAuth() })
    return { key: `${BLOB_PREFIX}${rel}`, name }
  }
  const full = path.join(process.cwd(), 'public', 'uploads', rel)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, bytes)
  return { key: `/uploads/${rel}`, name }
}

export async function readPrivateFile(key: string): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | null> {
  if (!key || key.includes('..')) return null
  if (key.startsWith(BLOB_PREFIX)) {
    const { get } = await import('@vercel/blob')
    const { blobAuth } = await import('@/lib/publications/social/blob-token')
    const r = await get(key.slice(BLOB_PREFIX.length), { access: 'private', ...blobAuth() })
    if (!r || r.statusCode !== 200) return null
    return { body: r.stream, contentType: r.blob.contentType || 'application/octet-stream' }
  }
  if (!key.startsWith('/uploads/')) return null
  const buf = await fs.readFile(path.join(process.cwd(), 'public', key)).catch(() => null)
  return buf ? { body: buf, contentType: 'application/octet-stream' } : null
}

/** Exclusão definitiva do arquivo no armazenamento (silenciosa se já não existe). */
export async function deletePrivateFile(key: string): Promise<void> {
  if (!key || key.includes('..')) return
  if (key.startsWith(BLOB_PREFIX)) {
    try {
      const { del } = await import('@vercel/blob')
      const { blobAuth } = await import('@/lib/publications/social/blob-token')
      await del(key.slice(BLOB_PREFIX.length), blobAuth())
    } catch { /* já removido */ }
    return
  }
  if (key.startsWith('/uploads/')) await fs.unlink(path.join(process.cwd(), 'public', key)).catch(() => {})
}
