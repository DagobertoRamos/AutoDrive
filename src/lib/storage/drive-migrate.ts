// =============================================================================
// Google Drive — leva os arquivos antigos (bytes no banco) para o Drive.
// Por arquivo: lê do banco → envia (o Drive confere o tamanho) → grava o id do
// Drive e SÓ ENTÃO zera os bytes no banco. Idempotente e retomável: roda em
// lotes (botão do MASTER e cron a cada 6 h) até não sobrar nada.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { driveEnabled, moveOnDrive, trashOnDrive } from './drive'
import {
  dealDrivePath, docAttachmentDrivePath, driveFileName, evaluationDrivePath, fiDocDrivePath, financeEntryDrivePath,
  uploadToDrive, vehicleDrivePath,
} from './drive-files'
import { putKeyOnDrive } from './drive-keys'
import { archiveAssetToDrive, assetsToArchive, assetsToArchiveCount } from './drive-assets'
import { DEAL_CATEGORY_LABEL } from '@/lib/negotiation/storage'
import { DOC_TYPE_LABEL, type DocType } from '@/lib/documents/attachment-types'
import { VEHICLE_FILE_LABEL, type VehicleFileKind } from '@/lib/stock/vehicle-files'

export interface DrivePending { evaluationFiles: number; vehicleFiles: number; privateFiles: number; pendingReceipts: number; images: number }

// Arquivos privados (chave blob://) que ainda estão no armazenamento da Vercel.
async function privatePendingCount(): Promise<number> {
  const r = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT (
      (SELECT count(*) FROM deal_attachments a WHERE a."storageKey" LIKE 'blob://%' AND NOT EXISTS (SELECT 1 FROM drive_files f WHERE f.key = a."storageKey")) +
      (SELECT count(*) FROM document_attachments a WHERE a."storageKey" LIKE 'blob://%' AND NOT EXISTS (SELECT 1 FROM drive_files f WHERE f.key = a."storageKey")) +
      (SELECT count(*) FROM financial_entry_attachments a WHERE a.url LIKE 'blob://%' AND NOT EXISTS (SELECT 1 FROM drive_files f WHERE f.key = a.url)) +
      (SELECT count(*) FROM finance_proposal_documents a WHERE a."storageKey" LIKE 'blob://%' AND NOT EXISTS (SELECT 1 FROM drive_files f WHERE f.key = a."storageKey"))
    ) AS n`
  return Number(r[0]?.n ?? 0)
}

// Comprovantes provisórios já vinculados a uma negociação (mudar de pasta no Drive).
async function linkedPendingReceipts(take: number) {
  return prisma.$queryRaw<{ key: string; driveFileId: string; dealId: string }[]>`
    SELECT f.key, f."driveFileId", a."dealId" FROM drive_files f JOIN deal_attachments a ON a."storageKey" = f.key
    WHERE f.pending = true LIMIT ${take}`
}

export async function drivePending(): Promise<DrivePending> {
  const [e, v, p, r, i] = await Promise.all([
    prisma.evaluationFile.count({ where: { driveFileId: null, NOT: { data: null } } }),
    prisma.vehicleFile.count({ where: { driveFileId: null, NOT: { data: null } } }),
    privatePendingCount(),
    linkedPendingReceipts(1000).then((x) => x.length),
    assetsToArchiveCount(),
  ])
  return { evaluationFiles: e, vehicleFiles: v, privateFiles: p, pendingReceipts: r, images: i }
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
  const out: DriveMigrateResult = { migrated: 0, failed: 0, errors: [], pending: { evaluationFiles: 0, vehicleFiles: 0, privateFiles: 0, pendingReceipts: 0, images: 0 }, stoppedByTime: false }
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

  // Arquivos privados (Vercel Blob) → Drive. A chave não muda; só some do Blob
  // depois que o Drive confirmou e o vínculo foi gravado.
  if (!timeUp()) await migratePrivateFiles(out, max, timeUp, fail)

  // Acervo: cópia das fotos do estoque e imagens do site.
  if (!timeUp()) {
    for (const id of await assetsToArchive(max)) {
      if (timeUp() || out.migrated + out.failed >= max) break
      try { if (await archiveAssetToDrive(id)) out.migrated++ } catch (e) { fail(`imagem ${id}`, e) }
    }
  }

  // Comprovantes provisórios já vinculados → pasta da negociação.
  if (!timeUp()) {
    for (const r of await linkedPendingReceipts(max)) {
      if (timeUp()) break
      try {
        await moveOnDrive(r.driveFileId, (await dealDrivePath(r.dealId)).path)
        await prisma.driveFile.update({ where: { key: r.key }, data: { pending: false } })
        out.migrated++
      } catch (e) { fail(`comprovante ${r.key}`, e) }
    }
  }

  out.pending = await drivePending()
  return out
}

interface PrivateCandidate { key: string; tenantId: string | null; mime: string | null; name: string; label: string | null; path: () => Promise<string[]> }

async function blobBytes(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const { get } = await import('@vercel/blob')
  const { blobAuth } = await import('@/lib/publications/social/blob-token')
  const r = await get(key.slice('blob://'.length), { access: 'private', ...blobAuth() })
  if (!r || r.statusCode !== 200 || !r.stream) return null
  const bytes = Buffer.from(await new Response(r.stream).arrayBuffer())
  return { bytes, contentType: r.blob.contentType || 'application/octet-stream' }
}

async function privateCandidates(take: number): Promise<PrivateCandidate[]> {
  const blob = { startsWith: 'blob://' }
  const [deals, docs, fins, fis] = await Promise.all([
    prisma.dealAttachment.findMany({ where: { storageKey: blob }, select: { storageKey: true, tenantId: true, mimeType: true, fileName: true, category: true, dealId: true }, take }),
    prisma.documentAttachment.findMany({ where: { storageKey: blob }, select: { storageKey: true, tenantId: true, mimeType: true, name: true, docType: true, entityType: true, entityId: true }, take }),
    prisma.financialEntryAttachment.findMany({ where: { url: blob }, select: { url: true, tenantId: true, mimeType: true, name: true, entryId: true }, take }),
    prisma.financeProposalDocument.findMany({ where: { storageKey: blob }, select: { id: true, storageKey: true, tenantId: true, mimeType: true, fileName: true, type: true }, take }),
  ])
  const all: PrivateCandidate[] = [
    ...deals.map((d) => ({
      key: d.storageKey, tenantId: d.tenantId, mime: d.mimeType, name: d.fileName, label: DEAL_CATEGORY_LABEL[d.category] ?? null,
      path: async () => (await dealDrivePath(d.dealId)).path,
    })),
    ...docs.map((d) => ({
      key: d.storageKey, tenantId: d.tenantId, mime: d.mimeType, name: d.name, label: DOC_TYPE_LABEL[d.docType as DocType] ?? null,
      path: () => docAttachmentDrivePath(d.tenantId, d.entityType, d.entityId),
    })),
    ...fins.map((f) => ({
      key: f.url, tenantId: f.tenantId, mime: f.mimeType, name: f.name, label: null as string | null,
      path: async () => (await financeEntryDrivePath(f.entryId)).path,
    })),
    ...fis.map((f) => ({
      key: f.storageKey!, tenantId: f.tenantId, mime: f.mimeType, name: f.fileName ?? 'documento', label: f.type,
      path: async () => (await fiDocDrivePath(f.id)).path,
    })),
  ]
  const done = new Set((await prisma.driveFile.findMany({ where: { key: { in: all.map((a) => a.key) } }, select: { key: true } })).map((r) => r.key))
  return all.filter((a) => !done.has(a.key))
}

async function migratePrivateFiles(out: DriveMigrateResult, max: number, timeUp: () => boolean, fail: (what: string, e: unknown) => void) {
  const { del } = await import('@vercel/blob')
  const { blobAuth } = await import('@/lib/publications/social/blob-token')
  for (const c of await privateCandidates(max)) {
    if (timeUp() || out.migrated + out.failed >= max) break
    try {
      const f = await blobBytes(c.key)
      if (!f) { fail(`arquivo ${c.key}`, new Error('não encontrado no armazenamento da Vercel')); continue }
      const mime = c.mime || f.contentType
      await putKeyOnDrive({ key: c.key, path: await c.path(), fileName: driveFileName(c.label, c.name), mimeType: mime, bytes: f.bytes, tenantId: c.tenantId })
      await del(c.key.slice('blob://'.length), blobAuth()).catch((e) => console.warn('[drive-migrate] Blob não apagado', c.key, e instanceof Error ? e.message : e))
      out.migrated++
    } catch (e) { fail(`arquivo ${c.key}`, e) }
  }
}
