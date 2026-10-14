// =============================================================================
// Arquivos privados por CHAVE (blob://...) no Google Drive.
// Os anexos de negociação, F&I, financeiro e documentos guardam uma chave
// lógica `blob://<pasta>/<arquivo>`. Quando o conteúdo está no Drive, a tabela
// drive_files liga essa chave ao arquivo do Drive — a chave, os links e as
// regras de acesso das rotas continuam exatamente os mesmos.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { readFromDrive, trashOnDrive, uploadToDrive } from './drive'

export interface DriveKeyRow { key: string; driveFileId: string; mimeType: string | null; pending: boolean }

export async function driveKeyLookup(key: string): Promise<DriveKeyRow | null> {
  if (!key) return null
  return prisma.driveFile.findUnique({ where: { key }, select: { key: true, driveFileId: true, mimeType: true, pending: true } }).catch(() => null)
}

/** Envia ao Drive e registra a chave. Se o registro falhar, o arquivo vai para a lixeira. */
export async function putKeyOnDrive(input: {
  key: string; path: string[]; fileName: string; mimeType: string; bytes: Buffer; tenantId?: string | null; pending?: boolean
}): Promise<string> {
  const driveFileId = await uploadToDrive(input.path, input.fileName, input.mimeType, input.bytes)
  try {
    await prisma.driveFile.create({ data: { key: input.key, driveFileId, tenantId: input.tenantId ?? null, mimeType: input.mimeType, pending: !!input.pending } })
  } catch (e) {
    await trashOnDrive(driveFileId).catch(() => undefined)
    throw e
  }
  return driveFileId
}

export async function readKeyFromDrive(row: DriveKeyRow): Promise<{ bytes: Buffer; contentType: string }> {
  return { bytes: await readFromDrive(row.driveFileId), contentType: row.mimeType || 'application/octet-stream' }
}

/** Remove do Drive (lixeira) e apaga o vínculo. true = a chave estava no Drive. */
export async function deleteKeyFromDrive(key: string): Promise<boolean> {
  const row = await driveKeyLookup(key)
  if (!row) return false
  await trashOnDrive(row.driveFileId).catch((e) => console.warn('[drive-keys] lixeira do Drive', e instanceof Error ? e.message : e))
  await prisma.driveFile.delete({ where: { key } }).catch(() => undefined)
  return true
}

/** Buffer → ReadableStream (as rotas de negociação respondem com stream). */
export function bufferStream(bytes: Buffer): ReadableStream<Uint8Array> {
  return new Blob([new Uint8Array(bytes)]).stream()
}
