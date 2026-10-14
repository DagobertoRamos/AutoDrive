// =============================================================================
// Google Drive — onde cada arquivo do sistema mora (loja/área/mês/veículo) e
// envio com contexto. Quem chama decide o que fazer se falhar (cair p/ banco).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { DRIVE_PENDING_FOLDER, drivePath, PERSONAL_DOC_CATEGORIES, type DriveArea, type DriveVehicleRef } from './drive-core'
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

// ── Fase 2: negociações, F&I, financeiro e documentos gerais ────────────────

const VEHICLE_REF = { brand: true, model: true, plate: true } as const

/** Negociação → Negociações/<MM-AAAA>/<Cliente - Veículo vendido - PLACA>. */
export async function dealDrivePath(dealId: string): Promise<{ path: string[]; tenantId: string | null }> {
  const d = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      tenantId: true, createdAt: true,
      customer: { select: { name: true } }, person: { select: { nomeCompleto: true } },
      vehicles: { select: { role: true, plate: true, vehicle: { select: VEHICLE_REF } }, orderBy: { createdAt: 'asc' } },
    },
  })
  const dv = d?.vehicles.find((v) => v.role === 'VENDIDO') ?? d?.vehicles[0]
  const vehicle = dv ? { brand: dv.vehicle?.brand, model: dv.vehicle?.model, plate: dv.vehicle?.plate ?? dv.plate } : {}
  return {
    tenantId: d?.tenantId ?? null,
    path: drivePath({ store: await storeName(d?.tenantId), area: 'NEGOTIATIONS', date: d?.createdAt ?? new Date(), vehicle, personName: d?.customer?.name ?? d?.person?.nomeCompleto }),
  }
}

/** Comprovante enviado antes de a negociação existir (pasta provisória). */
export async function pendingReceiptDrivePath(tenantId: string): Promise<string[]> {
  return drivePath({ store: await storeName(tenantId), area: 'NEGOTIATIONS', date: new Date(), leaf: DRIVE_PENDING_FOLDER })
}

/** Documento do F&I → Documentos pessoais/<MM-AAAA>/<Proponente - Veículo - PLACA>. */
export async function fiDocDrivePath(docId: string): Promise<{ path: string[]; tenantId: string | null }> {
  const doc = await prisma.financeProposalDocument.findUnique({
    where: { id: docId },
    select: { tenantId: true, proponent: { select: { nomeCompleto: true } }, proposal: { select: { createdAt: true, vehicleId: true, dealId: true, proponent: { select: { nomeCompleto: true } } } } },
  })
  let vehicle: DriveVehicleRef = {}
  if (doc?.proposal?.vehicleId) vehicle = (await prisma.vehicle.findUnique({ where: { id: doc.proposal.vehicleId }, select: VEHICLE_REF })) ?? {}
  else if (doc?.proposal?.dealId) {
    const dv = await prisma.dealVehicle.findFirst({ where: { dealId: doc.proposal.dealId, role: 'VENDIDO' }, select: { plate: true, vehicle: { select: VEHICLE_REF } } })
    if (dv) vehicle = { brand: dv.vehicle?.brand, model: dv.vehicle?.model, plate: dv.vehicle?.plate ?? dv.plate }
  }
  const name = doc?.proponent?.nomeCompleto ?? doc?.proposal?.proponent?.nomeCompleto
  return {
    tenantId: doc?.tenantId ?? null,
    path: drivePath({ store: await storeName(doc?.tenantId), area: 'PERSONAL_DOCS', date: doc?.proposal?.createdAt ?? new Date(), vehicle, personName: name }),
  }
}

/** Lançamento financeiro → Financeiro/<MM-AAAA do vencimento>. */
export async function financeEntryDrivePath(entryId: string): Promise<{ path: string[]; tenantId: string | null; label: string }> {
  const e = await prisma.financialEntry.findUnique({ where: { id: entryId }, select: { tenantId: true, description: true, dueDate: true, createdAt: true } })
  return {
    tenantId: e?.tenantId ?? null,
    label: e?.description ?? 'Lançamento',
    path: drivePath({ store: await storeName(e?.tenantId), area: 'FINANCE', date: e?.dueDate ?? e?.createdAt ?? new Date() }),
  }
}

/** Documento genérico (DocumentAttachment) → pasta do veículo, da negociação ou Financeiro. */
export async function docAttachmentDrivePath(tenantId: string | null, entityType: string, entityId: string): Promise<string[]> {
  const t = entityType.toUpperCase()
  if (t === 'VEHICLE') return vehicleDrivePath(entityId)
  if (t === 'VEHICLE_SERVICE') {
    const s = await prisma.vehicleService.findUnique({ where: { id: entityId }, select: { vehicleId: true } })
    if (s?.vehicleId) return vehicleDrivePath(s.vehicleId)
  }
  let dealId: string | null = null
  if (t === 'DEAL') dealId = entityId
  else if (t === 'DEAL_SERVICE') dealId = (await prisma.dealService.findUnique({ where: { id: entityId }, select: { dealId: true } }))?.dealId ?? null
  else if (t === 'DEAL_PAYMENT') dealId = (await prisma.dealPayment.findUnique({ where: { id: entityId }, select: { dealId: true } }))?.dealId ?? null
  else if (t === 'WARRANTY_SALE') dealId = (await prisma.warrantySale.findUnique({ where: { id: entityId }, select: { dealId: true } }))?.dealId ?? null
  if (dealId) return (await dealDrivePath(dealId)).path
  // Fornecedor, folha e outros: Financeiro do mês.
  return drivePath({ store: await storeName(tenantId), area: 'FINANCE', date: new Date() })
}

/** Nome do arquivo no Drive: "<rótulo> - <nome original>" p/ achar fácil na pasta. */
export function driveFileName(label: string | null | undefined, original: string): string {
  const base = (original || 'arquivo').replace(/[/\\]+/g, '_').slice(0, 120)
  const l = String(label ?? '').trim()
  return l ? `${l.slice(0, 40)} - ${base}` : base
}

export { uploadToDrive }
