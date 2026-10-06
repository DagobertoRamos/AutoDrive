// Armazenamento dos anexos de lançamento (boleto, NF, comprovante).
// Usa o armazenamento privado comum (src/lib/storage/private-files.ts): Vercel
// Blob PRIVADO em produção, disco (public/uploads/finance) no dev. Em `url` fica
// a chave do arquivo; a abertura passa sempre pela rota autenticada
// /api/finance/entries/[id]/attachments/[attId].
import {
  MAX_PRIVATE_FILE_BYTES, validatePrivateFile, savePrivateFile, readPrivateFile, deletePrivateFile,
} from '@/lib/storage/private-files'

export const MAX_ATTACHMENT_BYTES = MAX_PRIVATE_FILE_BYTES
export const validateAttachment = validatePrivateFile
export const readAttachmentFile = readPrivateFile
export const deleteAttachmentFile = deletePrivateFile

export function saveAttachmentFile(tenantId: string, entryId: string, filename: string, mime: string, bytes: Buffer): Promise<{ key: string; name: string }> {
  return savePrivateFile(`finance/${tenantId}/${entryId}`, filename, mime, bytes)
}

/** Antes de apagar lançamentos: remove os arquivos dos anexos (as linhas caem em cascata). */
export async function deleteEntriesFiles(entryIds: string[]): Promise<void> {
  if (!entryIds.length) return
  const { prisma } = await import('@/lib/prisma')
  const rows = await prisma.financialEntryAttachment.findMany({ where: { entryId: { in: entryIds } }, select: { url: true } })
  await Promise.all(rows.map((r) => deletePrivateFile(r.url)))
}
