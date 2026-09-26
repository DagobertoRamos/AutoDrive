// =============================================================================
// Histórico do veículo na loja — todas as avaliações e passagens pelo estoque
// do MESMO carro (placa, chassi ou renavam), para comparar quando ele volta
// (ex.: entra de novo numa troca) e para a aba "Fotos da avaliação".
// Sempre restrito à loja (tenant).
// =============================================================================

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface HistoryIdentity { plate?: string | null; chassi?: string | null; renavam?: string | null }

export const normPlate   = (s?: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const normChassi  = (s?: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const normRenavam = (s?: string | null) => (s ?? '').replace(/\D/g, '')

export interface HistoryEvaluation {
  id: string; createdAt: string; status: string | null; km: number | null
  evaluatedValue: number | null; fipeValue: number | null; customerDecision: string | null
  evaluatorName: string | null; vehicleId: string | null
  photos: Array<{ id: string; url: string; section: string | null }>
}
export interface HistoryPassage {
  id: string; entryDate: string | null; exitDate: string | null; createdAt: string
  stockStatus: string | null; active: boolean; km: number | null
  salePrice: number | null; purchasePrice: number | null; originType: string | null; photos: number
}
export interface VehicleHistory { evaluations: HistoryEvaluation[]; passages: HistoryPassage[] }

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d))

export async function loadVehicleHistory(tenantId: string | null, id: HistoryIdentity): Promise<VehicleHistory> {
  const plate = normPlate(id.plate)
  const chassi = normChassi(id.chassi)
  const renavam = normRenavam(id.renavam)
  if (!tenantId || (plate.length < 7 && chassi.length < 11 && renavam.length < 9)) return { evaluations: [], passages: [] }

  const conds = (p: string, c: string, r: string) => {
    const list: Prisma.Sql[] = []
    if (plate.length >= 7) list.push(Prisma.sql`regexp_replace(upper(coalesce(${Prisma.raw(p)}, '')), '[^A-Z0-9]', '', 'g') = ${plate}`)
    if (chassi.length >= 11) list.push(Prisma.sql`regexp_replace(upper(coalesce(${Prisma.raw(c)}, '')), '[^A-Z0-9]', '', 'g') = ${chassi}`)
    if (renavam.length >= 9) list.push(Prisma.sql`regexp_replace(coalesce(${Prisma.raw(r)}, ''), '[^0-9]', '', 'g') = ${renavam}`)
    return Prisma.join(list, ' OR ')
  }

  const [evalIds, vehicleIds] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM vehicle_evaluations WHERE "tenantId" = ${tenantId} AND (${conds('plate', 'chassi', 'renavam')}) ORDER BY "createdAt" DESC LIMIT 50`,
    prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM vehicles WHERE "tenantId" = ${tenantId} AND (${conds('plate', 'chassi', 'renavam')}) ORDER BY "createdAt" DESC LIMIT 50`,
  ])

  const [evals, vehicles] = await Promise.all([
    evalIds.length ? prisma.vehicleEvaluation.findMany({
      where:   { id: { in: evalIds.map((e) => e.id) } },
      orderBy: { createdAt: 'desc' },
      select:  {
        id: true, createdAt: true, status: true, km: true, evaluatedValue: true, fipeValue: true, customerDecision: true, vehicleId: true,
        evaluatedBy: { select: { name: true } },
      },
    }) : [],
    vehicleIds.length ? prisma.vehicle.findMany({
      where:   { id: { in: vehicleIds.map((v) => v.id) } },
      orderBy: { createdAt: 'desc' },
      select:  {
        id: true, entryDate: true, exitDate: true, createdAt: true, stockStatus: true, active: true, km: true,
        salePrice: true, purchasePrice: true, originType: true, _count: { select: { photos: true } },
      },
    }) : [],
  ])

  const atts = evals.length ? await prisma.evaluationAttachment.findMany({
    where:   { evaluationId: { in: evals.map((e) => e.id) }, fileType: 'image', publicUrl: { not: null } },
    orderBy: { createdAt: 'asc' },
    select:  { id: true, evaluationId: true, publicUrl: true, section: true },
  }) : []
  const byEval = new Map<string, HistoryEvaluation['photos']>()
  for (const a of atts) {
    if (!byEval.has(a.evaluationId)) byEval.set(a.evaluationId, [])
    byEval.get(a.evaluationId)!.push({ id: a.id, url: a.publicUrl!, section: a.section })
  }

  return {
    evaluations: evals.map((e) => ({
      id: e.id, createdAt: e.createdAt.toISOString(), status: e.status, km: e.km,
      evaluatedValue: num(e.evaluatedValue), fipeValue: num(e.fipeValue), customerDecision: e.customerDecision,
      evaluatorName: e.evaluatedBy?.name ?? null, vehicleId: e.vehicleId, photos: byEval.get(e.id) ?? [],
    })),
    passages: vehicles.map((v) => ({
      id: v.id, entryDate: v.entryDate?.toISOString() ?? null, exitDate: v.exitDate?.toISOString() ?? null, createdAt: v.createdAt.toISOString(),
      stockStatus: v.stockStatus, active: v.active, km: v.km, salePrice: num(v.salePrice), purchasePrice: num(v.purchasePrice),
      originType: v.originType, photos: v._count.photos,
    })),
  }
}
