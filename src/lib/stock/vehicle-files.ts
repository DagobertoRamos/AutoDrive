// =============================================================================
// Arquivos do veículo (laudo cautelar, fotos do recebimento, comprovantes).
// Conteúdo no Google Drive quando a conta está conectada (AutoDrive/<Loja>/
// Documentos dos veículos/<MM-AAAA>/<Veículo - PLACA>); senão bytes no banco,
// lidos via SQL base64 — o adapter Neon de produção não lê colunas Bytes pelo
// Prisma ("JS functions cannot be represented..."). O registro e o link não mudam.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { driveEnabled, readFromDrive, trashOnDrive } from '@/lib/storage/drive'
import { driveFileName, uploadToDrive, vehicleDrivePath } from '@/lib/storage/drive-files'

export const VEHICLE_FILE_KINDS = ['LAUDO_CAUTELAR', 'RECEBIMENTO', 'SERVICO', 'COMPROVANTE', 'OUTRO'] as const
export type VehicleFileKind = (typeof VEHICLE_FILE_KINDS)[number]
export const VEHICLE_FILE_MAX = 10 * 1024 * 1024

const ALLOWED: Record<string, true> = {
  'image/jpeg': true, 'image/jpg': true, 'image/png': true, 'image/webp': true, 'image/heic': true, 'image/heif': true, 'application/pdf': true,
}

export function validateVehicleFile(mime: string, size: number): string | null {
  if (!ALLOWED[mime.toLowerCase()]) return 'Envie PDF ou imagem (JPG, PNG, WebP, HEIC).'
  if (!size) return 'Arquivo vazio.'
  if (size > VEHICLE_FILE_MAX) return 'Arquivo acima de 10 MB.'
  return null
}

export const vehicleFileUrl = (id: string) => `/api/vehicles/files/${id}`

export interface VehicleFileMeta {
  id: string; kind: string; refKey: string | null; fileName: string; mimeType: string; fileSize: number
  uploadedByName: string | null; createdAt: Date; url: string
}

const META = { id: true, kind: true, refKey: true, fileName: true, mimeType: true, fileSize: true, uploadedByName: true, createdAt: true } as const

export async function listVehicleFiles(vehicleId: string, kind?: string, refKey?: string): Promise<VehicleFileMeta[]> {
  const rows = await prisma.vehicleFile.findMany({
    where:   { vehicleId, ...(kind ? { kind } : {}), ...(refKey ? { refKey } : {}) },
    orderBy: { createdAt: 'asc' },
    select:  META,
  })
  return rows.map((r) => ({ ...r, url: vehicleFileUrl(r.id) }))
}

export async function saveVehicleFile(input: {
  tenantId: string | null; vehicleId: string; kind: VehicleFileKind; refKey?: string | null
  fileName: string; mimeType: string; bytes: Buffer; user: { id: string; name?: string | null }
}): Promise<VehicleFileMeta> {
  const safe = (input.fileName || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'arquivo'
  // Drive conectado: os bytes vão para lá; se falhar, ficam no banco (a migração leva depois).
  let driveFileId: string | null = null
  if (await driveEnabled()) {
    try {
      driveFileId = await uploadToDrive(await vehicleDrivePath(input.vehicleId), driveFileName(VEHICLE_FILE_LABEL[input.kind], safe), input.mimeType, input.bytes)
    } catch (e) {
      console.error('[vehicle-files] Drive falhou — gravando no banco:', e instanceof Error ? e.message : e)
    }
  }
  try {
    const row = await prisma.vehicleFile.create({
      data: {
        tenantId: input.tenantId, vehicleId: input.vehicleId, kind: input.kind, refKey: input.refKey ?? null,
        fileName: safe, mimeType: input.mimeType, fileSize: input.bytes.length,
        ...(driveFileId ? { driveFileId } : { data: new Uint8Array(input.bytes) }),
        uploadedById: input.user.id, uploadedByName: input.user.name ?? null,
      },
      select: META,
    })
    return { ...row, url: vehicleFileUrl(row.id) }
  } catch (e) {
    if (driveFileId) await trashOnDrive(driveFileId).catch(() => undefined)
    throw e
  }
}

export const VEHICLE_FILE_LABEL: Record<VehicleFileKind, string> = {
  LAUDO_CAUTELAR: 'Laudo cautelar', RECEBIMENTO: 'Recebimento', SERVICO: 'Serviço', COMPROVANTE: 'Comprovante', OUTRO: 'Documento',
}

/** Apaga o arquivo do veículo (no Drive vai para a lixeira). */
export async function deleteVehicleFile(id: string): Promise<void> {
  const row = await prisma.vehicleFile.delete({ where: { id }, select: { driveFileId: true } })
  if (row.driveFileId) await trashOnDrive(row.driveFileId).catch((e) => console.warn('[vehicle-files] lixeira do Drive', e instanceof Error ? e.message : e))
}

export async function readVehicleFile(id: string): Promise<{ tenantId: string | null; vehicleId: string; fileName: string; mimeType: string; data: Buffer } | null> {
  const meta = await prisma.vehicleFile.findUnique({ where: { id }, select: { tenantId: true, vehicleId: true, fileName: true, mimeType: true, driveFileId: true } })
  if (!meta) return null
  const base = { tenantId: meta.tenantId, vehicleId: meta.vehicleId, fileName: meta.fileName, mimeType: meta.mimeType }
  if (meta.driveFileId) return { ...base, data: await readFromDrive(meta.driveFileId) }
  const rows = await prisma.$queryRaw<Array<{ b64: string | null }>>`
    SELECT encode(data, 'base64') AS b64 FROM vehicle_files WHERE id = ${id} LIMIT 1`
  return rows[0]?.b64 ? { ...base, data: Buffer.from(rows[0].b64, 'base64') } : null
}

/** Laudos anexados ao carro + os da avaliação de origem (o laudo pode ter subido na avaliação). */
export async function countInspectionFiles(vehicleId: string, originEvaluationId: string | null): Promise<number> {
  const [own, fromEval] = await Promise.all([
    prisma.vehicleFile.count({ where: { vehicleId, kind: 'LAUDO_CAUTELAR' } }),
    originEvaluationId ? prisma.evaluationAttachment.count({ where: { evaluationId: originEvaluationId, category: 'LAUDO_CAUTELAR' } }) : 0,
  ])
  return own + fromEval
}
