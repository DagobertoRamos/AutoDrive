// =============================================================================
// Google Drive — onde cada arquivo do sistema mora (loja/área/mês/veículo) e
// envio com contexto. Quem chama decide o que fazer se falhar (cair p/ banco).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { drivePath, PERSONAL_DOC_CATEGORIES, type DriveArea } from './drive-core'
import { uploadToDrive } from './drive'

async function storeName(tenantId: string | null | undefined): Promise<string> {
  if (!tenantId) return 'Sem loja'
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, nomeFantasia: true } }).catch(() => null)
  return t?.nomeFantasia?.trim() || t?.name?.trim() || 'Loja'
}

/** Caminho da avaliação (CNH e afins → Documentos pessoais do dono do carro). */
export async function evaluationDrivePath(evaluationId: string, category?: string | null): Promise<{ path: string[]; tenantId: string | null }> {
  const ev = await prisma.vehicleEvaluation.findUnique({
    where: { id: evaluationId },
    select: { tenantId: true, plate: true, brand: true, model: true, createdAt: true, ownerName: true },
  })
  const area: DriveArea = category && PERSONAL_DOC_CATEGORIES.has(category.toUpperCase()) ? 'PERSONAL_DOCS' : 'EVALUATION'
  return {
    tenantId: ev?.tenantId ?? null,
    path: drivePath({ store: await storeName(ev?.tenantId), area, date: ev?.createdAt ?? new Date(), vehicle: ev ?? {}, personName: ev?.ownerName }),
  }
}

/** Caminho dos documentos do veículo (mês de entrada no estoque). */
export async function vehicleDrivePath(vehicleId: string): Promise<string[]> {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { tenantId: true, plate: true, brand: true, model: true, entryDate: true, createdAt: true } })
  return drivePath({ store: await storeName(v?.tenantId), area: 'VEHICLE_DOCS', date: v?.entryDate ?? v?.createdAt ?? new Date(), vehicle: v ?? {} })
}

/** Nome do arquivo no Drive: "<rótulo> - <nome original>" p/ achar fácil na pasta. */
export function driveFileName(label: string | null | undefined, original: string): string {
  const base = (original || 'arquivo').replace(/[/\\]+/g, '_').slice(0, 120)
  const l = String(label ?? '').trim()
  return l ? `${l.slice(0, 40)} - ${base}` : base
}

export { uploadToDrive }
