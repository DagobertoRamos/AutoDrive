// =============================================================================
// Arquivos do veículo (laudo cautelar, fotos do recebimento, comprovantes).
// Bytes no banco; leitura via SQL base64 — o adapter Neon de produção não lê
// colunas Bytes pelo Prisma ("JS functions cannot be represented...").
// =============================================================================

import { prisma } from '@/lib/prisma'

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
  const row = await prisma.vehicleFile.create({
    data: {
      tenantId: input.tenantId, vehicleId: input.vehicleId, kind: input.kind, refKey: input.refKey ?? null,
      fileName: safe, mimeType: input.mimeType, fileSize: input.bytes.length, data: new Uint8Array(input.bytes),
      uploadedById: input.user.id, uploadedByName: input.user.name ?? null,
    },
    select: META,
  })
  return { ...row, url: vehicleFileUrl(row.id) }
}

export async function readVehicleFile(id: string): Promise<{ tenantId: string | null; vehicleId: string; fileName: string; mimeType: string; data: Buffer } | null> {
  const rows = await prisma.$queryRaw<Array<{ tenantId: string | null; vehicleId: string; fileName: string; mimeType: string; b64: string }>>`
    SELECT "tenantId", "vehicleId", "fileName", "mimeType", encode(data, 'base64') AS b64 FROM vehicle_files WHERE id = ${id} LIMIT 1`
  const r = rows[0]
  return r ? { tenantId: r.tenantId, vehicleId: r.vehicleId, fileName: r.fileName, mimeType: r.mimeType, data: Buffer.from(r.b64, 'base64') } : null
}

/** Laudos anexados ao carro + os da avaliação de origem (o laudo pode ter subido na avaliação). */
export async function countInspectionFiles(vehicleId: string, originEvaluationId: string | null): Promise<number> {
  const [own, fromEval] = await Promise.all([
    prisma.vehicleFile.count({ where: { vehicleId, kind: 'LAUDO_CAUTELAR' } }),
    originEvaluationId ? prisma.evaluationAttachment.count({ where: { evaluationId: originEvaluationId, category: 'LAUDO_CAUTELAR' } }) : 0,
  ])
  return own + fromEval
}
