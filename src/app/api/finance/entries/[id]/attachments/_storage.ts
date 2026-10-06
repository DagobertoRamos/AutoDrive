// Armazenamento dos anexos de lançamento (boleto, NF, comprovante).
// Mesmo backend dos anexos da negociação: Vercel Blob PRIVADO em produção,
// disco (public/uploads/finance) no dev. Em `url` fica a chave do arquivo
// (blob://… ou /uploads/…); a abertura passa sempre pela rota autenticada
// /api/finance/entries/[id]/attachments/[attId].
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { BLOB_PREFIX, dealStorageBackend } from '@/lib/negotiation/storage'

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024 // corpo da requisição na Vercel ≈ 4,5 MB
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'text/xml', 'application/xml'])

export function validateAttachment(mime: string, size: number): string | null {
  if (!ALLOWED.has((mime || '').toLowerCase())) return 'Tipo não permitido. Envie PDF, imagem ou XML.'
  if (!size) return 'Arquivo vazio.'
  if (size > MAX_ATTACHMENT_BYTES) return 'Arquivo acima de 4 MB.'
  return null
}

const sanitize = (name: string) => path.basename(name || 'arquivo').replace(/[^\w\d.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'arquivo'

export async function saveAttachmentFile(tenantId: string, entryId: string, filename: string, mime: string, bytes: Buffer): Promise<{ key: string; name: string }> {
  const name = sanitize(filename)
  const rel = `finance/${tenantId}/${entryId}/${randomBytes(8).toString('hex')}_${name}`
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

export async function readAttachmentFile(key: string): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | null> {
  if (key.includes('..')) return null
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

export async function deleteAttachmentFile(key: string): Promise<void> {
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

/** Antes de apagar lançamentos: remove os arquivos dos anexos (as linhas caem em cascata). */
export async function deleteEntriesFiles(entryIds: string[]): Promise<void> {
  if (!entryIds.length) return
  const { prisma } = await import('@/lib/prisma')
  const rows = await prisma.financialEntryAttachment.findMany({ where: { entryId: { in: entryIds } }, select: { url: true } })
  await Promise.all(rows.map((r) => deleteAttachmentFile(r.url)))
}
