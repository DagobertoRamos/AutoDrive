// =============================================================================
// Google Drive — leva os arquivos antigos (bytes no banco) para o Drive.
// Por arquivo: lê do banco → envia (o Drive confere o tamanho) → grava o id do
// Drive e SÓ ENTÃO zera os bytes no banco. Idempotente e retomável: roda em
// lotes (botão do MASTER e cron a cada 6 h) até não sobrar nada.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { driveEnabled, trashOnDrive } from './drive'
import { driveFileName, evaluationDrivePath, uploadToDrive, vehicleDrivePath } from './drive-files'
import { VEHICLE_FILE_LABEL, type VehicleFileKind } from '@/lib/stock/vehicle-files'

export interface DrivePending { evaluationFiles: number; vehicleFiles: number }

export async function drivePending(): Promise<DrivePending> {
  const [e, v] = await Promise.all([
    prisma.evaluationFile.count({ where: { driveFileId: null, NOT: { data: null } } }),
    prisma.vehicleFile.count({ where: { driveFileId: null, NOT: { data: null } } }),
  ])
  return { evaluationFiles: e, vehicleFiles: v }
}

export interface DriveMigrateResult { migrated: number; failed: number; errors: string[]; pending: DrivePending; stoppedByTime: boolean }

async function readBytes(table: 'evaluation_files' | 'vehicle_files', id: string): Promise<Buffer | null> {
  const rows = table === 'evaluation_files'
    ? await prisma.$queryRaw<{ b64: string | null }[]>`SELECT encode(data, 'base64') AS b64 FROM evaluation_files WHERE id = ${id} AND "driveFileId" IS NULL`
    : await prisma.$queryRaw<{ b64: string | null }[]>`SELECT encode(data, 'base64') AS b64 FROM vehicle_files WHERE id = ${id} AND "driveFileId" IS NULL`
  return rows[0]?.b64 ? Buffer.from(rows[0].b64, 'base64') : null
}

export async function migrateToDrive(opts: { deadlineMs?: number; max?: number } = {}): Promise<DriveMigrateResult> {
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000)
  const max = opts.max ?? 500
  const out: DriveMigrateResult = { migrated: 0, failed: 0, errors: [], pending: { evaluationFiles: 0, vehicleFiles: 0 }, stoppedByTime: false }
  if (!(await driveEnabled())) throw new Error('Google Drive não conectado.')
  const fail = (what: string, e: unknown) => { out.failed++; if (out.errors.length < 10) out.errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)) }
  const timeUp = () => { if (Date.now() > deadline) { out.stoppedByTime = true; return true } return false }

  // Avaliações (a categoria vem do anexo: CNH → Documentos pessoais).
  const evals = await prisma.evaluationFile.findMany({ where: { driveFileId: null, NOT: { data: null } }, select: { id: true, evaluationId: true, fileName: true, mimeType: true }, orderBy: { createdAt: 'asc' }, take: max })
  for (const f of evals) {
    if (timeUp() || out.migrated + out.failed >= max) break
    try {
      const bytes = await readBytes('evaluation_files', f.id)
      if (!bytes) continue
      const att = await prisma.evaluationAttachment.findFirst({ where: { storageKey: `db://${f.id}` }, select: { category: true } })
      const { path, tenantId } = await evaluationDrivePath(f.evaluationId, att?.category)
      const driveFileId = await uploadToDrive(path, driveFileName(att?.category, f.fileName), f.mimeType, bytes)
      const n = await prisma.$executeRaw`UPDATE evaluation_files SET "driveFileId" = ${driveFileId}, data = NULL, "tenantId" = COALESCE("tenantId", ${tenantId}) WHERE id = ${f.id} AND "driveFileId" IS NULL`
      if (n === 0) await trashOnDrive(driveFileId).catch(() => undefined) // outro lote já levou
      else out.migrated++
    } catch (e) { fail(`avaliação ${f.id}`, e) }
  }

  // Documentos dos veículos.
  if (!timeUp()) {
    const vfs = await prisma.vehicleFile.findMany({ where: { driveFileId: null, NOT: { data: null } }, select: { id: true, vehicleId: true, kind: true, fileName: true, mimeType: true }, orderBy: { createdAt: 'asc' }, take: max })
    for (const f of vfs) {
      if (timeUp() || out.migrated + out.failed >= max) break
      try {
        const bytes = await readBytes('vehicle_files', f.id)
        if (!bytes) continue
        const label = VEHICLE_FILE_LABEL[f.kind as VehicleFileKind] ?? 'Documento'
        const driveFileId = await uploadToDrive(await vehicleDrivePath(f.vehicleId), driveFileName(label, f.fileName), f.mimeType, bytes)
        const n = await prisma.$executeRaw`UPDATE vehicle_files SET "driveFileId" = ${driveFileId}, data = NULL WHERE id = ${f.id} AND "driveFileId" IS NULL`
        if (n === 0) await trashOnDrive(driveFileId).catch(() => undefined)
        else out.migrated++
      } catch (e) { fail(`veículo ${f.id}`, e) }
    }
  }

  out.pending = await drivePending()
  return out
}
