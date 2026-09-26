// =============================================================================
// Entrada no estoque a partir da avaliação — parte com banco.
// Regras puras em ./stock-entry-core (testadas).
// =============================================================================

import type { Prisma, VehicleEvaluation, VehicleStockType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notify, notifyByRole } from '@/services/notification.service'
import type { EntryPendency } from './stock-entry-core'

type Tx = Prisma.TransactionClient

/** Carrega a avaliação com o que o fluxo de entrada precisa. */
export async function loadEvaluationForStock(id: string) {
  return prisma.vehicleEvaluation.findUnique({ where: { id } })
}

/** Tipo de estoque padrão: o da avaliação; senão consignado se só consignação foi liberada. */
export function defaultStockType(ev: Pick<VehicleEvaluation, 'stockType' | 'availableFor'>): VehicleStockType {
  if (ev.stockType) return ev.stockType
  const ops = (ev.availableFor ?? '').toUpperCase().split(',').filter(Boolean)
  return ops.length === 1 && ops[0] === 'CONSIGNACAO' ? 'CONSIGNADO' : 'PROPRIO'
}

/** Dados do Vehicle copiados da avaliação. */
export function vehicleDataFromEvaluation(
  ev: VehicleEvaluation,
  opts: { stockType: VehicleStockType; salePrice: number | null; purchasePrice: number | null; notes: string | null },
): Prisma.VehicleUncheckedCreateInput {
  return {
    tenantId:           ev.tenantId,
    unitId:             ev.unitId,
    originEvaluationId: ev.id,
    plate:              ev.plate?.toUpperCase() || null,
    chassi:             ev.chassi?.toUpperCase() || null,
    renavam:            ev.renavam || null,
    brand:              String(ev.brand ?? '').trim(),
    model:              String(ev.model ?? '').trim(),
    version:            ev.version || null,
    year:               ev.manufactureYear ?? null,
    modelYear:          ev.modelYear ?? null,
    km:                 ev.km ?? null,
    color:              ev.color || null,
    fuel:               ev.fuel || null,
    transmission:       ev.transmission || null,
    doors:              ev.doors ?? null,
    vehicleType:        ev.vehicleType ?? null,
    conditionType:      ev.conditionType ?? null,
    engine:             ev.engine || null,
    displacement:       ev.displacement || null,
    power:              ev.power || null,
    bodyType:           ev.bodyType || null,
    fipeValue:          ev.fipeValue ?? null,
    fipeCode:           ev.fipeCode || null,
    fipeReferenceMonth: ev.fipeReferenceMonth || null,
    // Entra ainda não recebido e com serviços a fazer: fica fora do site e da
    // venda até o gestor resolver as pendências e mudar o status.
    stockStatus:        'PENDENTE_PREPARACAO',
    stockType:          opts.stockType,
    salePrice:          opts.salePrice,
    purchasePrice:      opts.purchasePrice,
    notes:              opts.notes || ev.evaluationNotes || null,
    cautelarStatus:     ev.cautelarStatus ?? 'SEM_CAUTELAR',
    cautelarNumber:     ev.cautelarNumber || null,
    cautelarNotes:      ev.cautelarNotes || null,
    customerId:         null,
    entryDate:          new Date(),
    active:             true,
  }
}

/** Opção de pendência da loja com esse nome (ou global); cria na loja se não houver. */
async function ensurePendencyOption(tx: Tx, tenantId: string | null, p: EntryPendency): Promise<string> {
  const found = await tx.stockPendencyOption.findFirst({
    where: {
      label: { equals: p.label, mode: 'insensitive' },
      OR:    [{ tenantId }, { tenantId: null }],
    },
    orderBy: { tenantId: 'desc' }, // prefere a da loja à global
    select:  { id: true, active: true },
  })
  if (found) {
    if (!found.active) await tx.stockPendencyOption.update({ where: { id: found.id }, data: { active: true } })
    return found.id
  }
  const created = await tx.stockPendencyOption.create({
    data: { tenantId, label: p.label, description: p.description, category: p.category },
    select: { id: true },
  })
  return created.id
}

/** Aplica as pendências de entrada ao veículo recém-criado. */
export async function applyEntryPendencies(tx: Tx, tenantId: string | null, vehicleId: string, list: EntryPendency[]) {
  for (const p of list) {
    const optionId = await ensurePendencyOption(tx, tenantId, p)
    await tx.vehicleStockPendency.upsert({
      where:  { vehicleId_optionId: { vehicleId, optionId } },
      create: { vehicleId, optionId, notes: p.notes },
      update: { notes: p.notes, resolved: false, resolvedAt: null, resolvedById: null },
    })
  }
}

export function evalLabel(ev: Pick<VehicleEvaluation, 'plate' | 'brand' | 'model'>): string {
  return [ev.plate, ev.brand, ev.model].filter(Boolean).join(' • ') || 'Avaliação'
}

/** Vendedor responsável: quem pediu a aprovação, senão quem avaliou. */
export function sellerOf(ev: Pick<VehicleEvaluation, 'approvalRequestedById' | 'evaluatedById'>): string | null {
  return ev.approvalRequestedById ?? ev.evaluatedById ?? null
}

export async function notifyManagersStockRequest(ev: VehicleEvaluation, byName: string | null) {
  if (!ev.tenantId) return
  await notifyByRole({
    tenantId:  ev.tenantId,
    roles:     ['GERENTE', 'GERENTE_GERAL', 'ADM'],
    unitId:    ev.unitId ?? undefined,
    type:      'SISTEMA',
    title:     'Veículo aguardando entrada no estoque',
    message:   `${evalLabel(ev)}: cliente aceitou a proposta${byName ? ` (${byName})` : ''}. Confirme a entrada no estoque.`,
    actionUrl: `/estoque/avaliacao/${ev.id}/inspecao`,
    metadata:  { evaluationId: ev.id },
    channels:  ['APP_WEB', 'APP_MOBILE', 'PUSH'],
  }).catch((e) => console.error('[stock-entry] notify managers failed', e))
}

export async function notifySeller(ev: VehicleEvaluation, title: string, message: string, actionUrl: string) {
  const sellerId = sellerOf(ev)
  if (!sellerId) return
  await notify({
    userId: sellerId, tenantId: ev.tenantId ?? null, type: 'SISTEMA',
    title, message, actionUrl, metadata: { evaluationId: ev.id },
    channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
  }).catch((e) => console.error('[stock-entry] notify seller failed', e))
}
