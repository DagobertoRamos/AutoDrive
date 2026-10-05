// =============================================================================
// deal-children.ts — Veículos, pagamentos e débitos de uma negociação
// (a edição de pagamentos/débitos com log fica em children-sync.ts)
// Usado na criação (POST /api/negotiations) e na edição (PATCH /api/negotiations/[id])
// para que as duas portas apliquem as MESMAS travas: carro em outra venda,
// carro com outra negociação de entrada, avaliação liberada/aceita para troca,
// pagamento confirmado pelo financeiro não muda pela tela de negociação.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
import { BLOB_PREFIX, pendingFolder } from '@/lib/negotiation/storage'
import { parseDateOnly } from '@/lib/negotiation/date-only'
import { MANAGER_REVIEW_REASON, needsManagerReview } from '@/lib/evaluation/site-pre-evaluation'

type Tx = any

/** Status em que a negociação "segura" o carro (venda em andamento ou concluída). */
export const OPEN_DEAL_STATUSES = [
  'AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO',
  'APROVADA', 'LIBERADA', 'SINAL_RECEBIDO', 'RESERVADA',
  'AGUARDANDO_FINANCEIRO', 'FINANCEIRO_APROVADO',
  'AGUARDANDO_DOCUMENTACAO', 'DOCUMENTACAO_CONCLUIDA',
  'AGUARDANDO_CONTRATO', 'CONTRATO_GERADO',
  'AGUARDANDO_ASSINATURA', 'ASSINADA',
  'AGUARDANDO_ENTREGA', 'ENTREGUE', 'EM_ANDAMENTO', 'FINALIZADA',
  // Reaberta / devolvida para correção continuam segurando o carro.
  'REABERTA', 'DEVOLVIDA_PARA_CORRECAO',
]

export const MAIN_VEHICLE_ROLES = ['VENDIDO', 'COMPRADO', 'CONSIGNADO']
export const VEHICLE_ROLE_BY_TYPE: Record<string, string> = {
  VENDA: 'VENDIDO', COMPRA: 'COMPRADO', TROCA: 'VENDIDO', CONSIGNACAO: 'CONSIGNADO',
}
/** Estados de estoque que a negociação colocou no carro e que voltam a DISPONIVEL ao soltá-lo. */
const HELD_STOCK = ['EM_NEGOCIACAO', 'RESERVADO']

const normPlate = (p: unknown) => (typeof p === 'string' ? p.toUpperCase().replace(/[^A-Z0-9]/g, '') : '')
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const notInDeal = (excludeDealId?: string | null) => (excludeDealId ? { id: { not: excludeDealId } } : {})

// ── Travas ────────────────────────────────────────────────────────────────────

/** VENDA/TROCA: o carro do estoque não pode estar vendido em outra negociação ativa. */
export async function assertVehicleNotInOtherSale(tx: Tx, vehicleId: string, excludeDealId?: string | null) {
  const conflict: any = await tx.dealVehicle.findFirst({
    where: {
      vehicleId,
      // Só venda conflita: consignação/compra são a ENTRADA do carro.
      role: 'VENDIDO',
      deal: { status: { in: OPEN_DEAL_STATUSES as never[] }, ...notInDeal(excludeDealId) },
    },
    select: { deal: { select: { id: true, dealNumber: true, status: true, seller: { select: { fullName: true, shortName: true } } } } },
  })
  if (!conflict?.deal) return
  const approved = new Set(OPEN_DEAL_STATUSES.filter((s) => s !== 'AGUARDANDO_APROVACAO' && s !== 'AGUARDANDO_LIBERACAO' && s !== 'DEVOLVIDA_PARA_CORRECAO'))
  const sellerLbl = conflict.deal.seller?.shortName ?? conflict.deal.seller?.fullName ?? 'outro vendedor'
  const negLbl    = conflict.deal.dealNumber ?? conflict.deal.id.slice(0, 8)
  throw new Error(approved.has(conflict.deal.status)
    ? `Este veículo não está mais disponível. Venda já liberada pelo gerente na negociação ${negLbl}.`
    : `Este veículo já está em negociação pelo vendedor ${sellerLbl} (negociação ${negLbl}).`)
}

/** COMPRA/CONSIGNAÇÃO: um carro só tem UMA negociação de entrada ativa. */
export async function assertNoOtherEntryDeal(
  tx: Tx, tenantId: string | null, vehicle: { vehicleId?: string | null; plate?: string | null }, excludeDealId?: string | null,
) {
  const plate = normPlate(vehicle.plate)
  if (!vehicle.vehicleId && !plate) return
  const dup = await tx.dealVehicle.findFirst({
    where: {
      role: { in: ['CONSIGNADO', 'COMPRADO'] },
      OR: [
        ...(vehicle.vehicleId ? [{ vehicleId: vehicle.vehicleId }] : []),
        ...(!vehicle.vehicleId && plate ? [{ plate }] : []),
      ],
      deal: { tenantId, status: { notIn: ['CANCELADA', 'RECUSADA', 'DESAPROVADA', 'FINALIZADA'] as never[] }, ...notInDeal(excludeDealId) },
    },
    select: { deal: { select: { dealNumber: true, status: true } } },
  })
  if (dup) throw new Error(`Este veículo já tem a negociação de entrada ${dup.deal.dealNumber ?? ''} (${String(dup.deal.status).toLowerCase().replace(/_/g, ' ')}). Abra-a em vez de criar outra.`.replace('  ', ' '))
}

/** TROCA: só entra avaliação liberada pelo gerente, aceita pelo cliente e fora de outra troca ativa. */
export async function assertTradeEvaluationUsable(tx: Tx, evaluationId: string, plate: string, excludeDealId?: string | null) {
  const ev: any = await tx.vehicleEvaluation.findUnique({
    where:  { id: evaluationId },
    select: {
      id: true, status: true, result: true, customerDecision: true, availableFor: true,
      cancelledAt: true, proposalValidUntil: true, lookupSource: true, releasedByUserId: true,
    },
  })
  if (!ev) throw new Error('Avaliação informada não foi encontrada.')
  if (ev.cancelledAt) throw new Error('Este veículo avaliado não está disponível para troca. Avaliação cancelada.')
  const releasedOk = ['LIBERADA', 'APROVADO', 'APPROVED', 'FINALIZED', 'AGUARDANDO_ENTRADA', 'NO_ESTOQUE'].includes(
    (ev.status ?? ev.result ?? '').toUpperCase(),
  ) || (ev.result ?? '').toUpperCase() === 'APROVADO'
  if (!releasedOk) throw new Error('Este veículo avaliado não está disponível para troca. Proposta ainda não liberada pelo gerente.')
  if (needsManagerReview(ev)) throw new Error(`Este veículo avaliado não está disponível para troca. ${MANAGER_REVIEW_REASON}`)
  if ((ev.customerDecision ?? 'PENDENTE').toUpperCase() !== 'ACEITA')
    throw new Error('Este veículo avaliado não está disponível para troca. Cliente ainda não aceitou a proposta.')
  const af = (ev.availableFor ?? '').toUpperCase()
  if (af && !af.split(',').map((s: string) => s.trim()).includes('TROCA'))
    throw new Error('Este veículo avaliado não está disponível para troca. Liberação do gerente é para outra operação.')
  const conflict: any = await tx.dealVehicle.findFirst({
    where: { role: 'TROCA', plate: plate.toUpperCase(), deal: { status: { in: OPEN_DEAL_STATUSES as never[] }, ...notInDeal(excludeDealId) } },
    select: { deal: { select: { id: true, dealNumber: true } } },
  })
  if (conflict?.deal) throw new Error(`Este veículo avaliado já está vinculado à negociação ${conflict.deal.dealNumber ?? conflict.deal.id.slice(0, 8)}.`)
}

// ── Veículos (edição) ─────────────────────────────────────────────────────────

interface VehicleInput {
  vehicleId?: string | null; evaluationId?: string | null
  plate?: string | null; brand?: string | null; model?: string | null; year?: number | string | null
  color?: string | null; km?: number | string | null; condition?: string | null
  agreedValue?: number | string | null; evaluatedValue?: number | string | null; fipeValue?: number | string | null
  hasFinancing?: boolean; payoffValue?: number | string | null; payoffBank?: string | null; notes?: string | null
}

interface DealVehicleRow { id: string; role: string; vehicleId: string | null; plate: string | null }

export interface VehicleSyncResult {
  /** Carros do estoque que saíram desta negociação (voltaram a DISPONIVEL). */
  released: string[]
  /** Carros do estoque que entraram nesta negociação como venda. */
  held: string[]
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>
}

const sameCar = (row: DealVehicleRow, v: VehicleInput) =>
  v.vehicleId ? row.vehicleId === v.vehicleId : !!normPlate(v.plate) && normPlate(row.plate) === normPlate(v.plate)

const label = (r: { plate?: string | null; vehicleId?: string | null } | null | undefined) =>
  r ? (normPlate(r.plate) || r.vehicleId || 'veículo') : null

/** Devolve ao estoque um carro que esta negociação estava segurando (se nenhuma outra venda ativa o segura). */
export async function releaseStock(tx: Tx, vehicleId: string, dealId: string): Promise<boolean> {
  const other = await tx.dealVehicle.findFirst({
    where: { vehicleId, role: 'VENDIDO', deal: { id: { not: dealId }, status: { in: OPEN_DEAL_STATUSES as never[] } } },
    select: { id: true },
  })
  if (other) return false
  const r = await tx.vehicle.updateMany({ where: { id: vehicleId, stockStatus: { in: HELD_STOCK as never[] } }, data: { stockStatus: 'DISPONIVEL' as never } })
  return r.count > 0
}

function vehicleData(v: VehicleInput, extra: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...extra }
  if (v.plate !== undefined) data.plate = v.plate ? String(v.plate).toUpperCase() : null
  if (v.brand !== undefined) data.brand = v.brand || null
  if (v.model !== undefined) data.model = v.model || null
  if (v.year !== undefined) data.year = v.year ? Number(v.year) : null
  if (v.color !== undefined) data.color = v.color || null
  if (v.km !== undefined) data.km = v.km ? Number(v.km) : null
  if (v.condition !== undefined) data.condition = v.condition || null
  if (v.evaluatedValue !== undefined) data.evaluatedValue = numOrNull(v.evaluatedValue)
  if (v.fipeValue !== undefined) data.fipeValue = numOrNull(v.fipeValue)
  if (v.hasFinancing !== undefined) data.hasFinancing = !!v.hasFinancing
  if (v.payoffValue !== undefined) data.payoffValue = numOrNull(v.payoffValue)
  if (v.payoffBank !== undefined) data.payoffBank = v.payoffBank || null
  if (v.notes !== undefined) data.notes = v.notes || null
  return data
}

/**
 * Sincroniza veículo principal e veículo da troca com o que a tela de edição enviou.
 *  - `undefined` → não mexe (payload antigo / campo não enviado)
 *  - `null`      → o usuário removeu o veículo
 *  - objeto      → mantém (mesmo carro, atualiza dados) ou substitui (outro carro, com as travas)
 */
export async function syncDealVehicles(tx: Tx, args: {
  deal: { id: string; tenantId: string | null; unitId: string | null }
  type: string
  vehicle?: VehicleInput | null
  tradeInVehicle?: VehicleInput | null
  agreedValue?: number | null
  /** Veículos adicionais (mesmo papel do principal). Enviado = a tela trata a lista inteira. */
  extraVehicles?: VehicleInput[] | null
  /** Veículos adicionais recebidos na troca. */
  extraTradeInVehicles?: VehicleInput[] | null
}): Promise<VehicleSyncResult> {
  const { deal, type } = args
  const out: VehicleSyncResult = { released: [], held: [], changes: [] }
  const rows: DealVehicleRow[] = await tx.dealVehicle.findMany({
    where: { dealId: deal.id }, select: { id: true, role: true, vehicleId: true, plate: true }, orderBy: { createdAt: 'asc' },
  })

  // Tela nova: manda a lista completa (principal + adicionais) → sincroniza a lista.
  if (Array.isArray(args.extraVehicles) || Array.isArray(args.extraTradeInVehicles)) {
    const role = VEHICLE_ROLE_BY_TYPE[type] ?? 'VENDIDO'
    const mains = [args.vehicle, ...(args.extraVehicles ?? [])].filter((v): v is VehicleInput => !!v && !!(v.vehicleId || normPlate(v.plate) || v.brand))
    // Um veículo só e sem valor próprio: acompanha o valor da negociação (como antes).
    if (mains.length === 1 && mains[0].agreedValue == null) mains[0] = { ...mains[0], agreedValue: args.agreedValue ?? null }
    await syncVehicleList(tx, deal, type, role, rows.filter((r) => MAIN_VEHICLE_ROLES.includes(r.role)), mains, out)
    const trades = type === 'TROCA'
      ? [args.tradeInVehicle, ...(args.extraTradeInVehicles ?? [])].filter((v): v is VehicleInput => !!v && !!(normPlate(v.plate) || v.brand))
      : []
    await syncVehicleList(tx, deal, type, 'TROCA', rows.filter((r) => r.role === 'TROCA'), trades, out)
    return out
  }

  // ── Veículo principal ──
  // Venda de vários carros (lote) não é editada por aqui: a tela trata um veículo só.
  const mains = rows.filter((r) => MAIN_VEHICLE_ROLES.includes(r.role))
  if (args.vehicle !== undefined && mains.length <= 1) {
    const current = mains[0] ?? null
    const role = VEHICLE_ROLE_BY_TYPE[type] ?? 'VENDIDO'
    const v = args.vehicle
    const hasCar = !!v && !!(v.vehicleId || normPlate(v.plate) || v.brand)

    if (!hasCar) {
      if (current) {
        await tx.dealVehicle.delete({ where: { id: current.id } })
        if (current.vehicleId && current.role === 'VENDIDO' && await releaseStock(tx, current.vehicleId, deal.id)) out.released.push(current.vehicleId)
        out.changes.push({ field: 'vehicle', oldValue: label(current), newValue: null })
      }
    } else {
      const car = v as VehicleInput
      const keep = current && sameCar(current, car)
      let vehicleId: string | null = car.vehicleId ?? (keep ? current!.vehicleId : null)
      if (!vehicleId && normPlate(car.plate)) {
        const found = await tx.vehicle.findFirst({ where: { tenantId: deal.tenantId ?? undefined, plate: String(car.plate).toUpperCase() }, select: { id: true } })
        vehicleId = found?.id ?? (await tx.vehicle.create({
          data: {
            tenantId: deal.tenantId, unitId: deal.unitId, plate: String(car.plate).toUpperCase(),
            brand: car.brand ?? null, model: car.model ?? null, year: car.year ? Number(car.year) : null,
            color: car.color ?? null, km: car.km ? Number(car.km) : null,
          },
          select: { id: true },
        })).id
      }
      if (vehicleId) {
        // Carro do estoque precisa ser da mesma loja.
        const owned = await tx.vehicle.findFirst({ where: { id: vehicleId, ...(deal.tenantId ? { tenantId: deal.tenantId } : {}) }, select: { id: true } })
        if (!owned) throw new Error('Veículo não encontrado no estoque desta loja.')
      }
      const changingCar = !keep || (current && current.role !== role)
      if (changingCar) {
        if (vehicleId && (type === 'VENDA' || type === 'TROCA')) await assertVehicleNotInOtherSale(tx, vehicleId, deal.id)
        if (type === 'COMPRA' || type === 'CONSIGNACAO') await assertNoOtherEntryDeal(tx, deal.tenantId, { vehicleId, plate: car.plate }, deal.id)
      }
      // Valor acordado: no mesmo carro quem atualiza é o PATCH (acompanha o valor de venda);
      // carro novo nasce com o valor atual da negociação.
      const data = vehicleData(car, {
        vehicleId, role,
        ...(!keep ? { agreedValue: args.agreedValue ?? numOrNull(car.agreedValue) } : {}),
      })
      const before = current ? { ...current } : null
      if (current) await tx.dealVehicle.update({ where: { id: current.id }, data })
      else await tx.dealVehicle.create({ data: { ...data, dealId: deal.id } })

      if (!keep) {
        if (before?.vehicleId && before.role === 'VENDIDO' && before.vehicleId !== vehicleId && await releaseStock(tx, before.vehicleId, deal.id)) out.released.push(before.vehicleId)
        out.changes.push({ field: 'vehicle', oldValue: label(before), newValue: label({ plate: car.plate, vehicleId }) })
      }
      if (vehicleId && role === 'VENDIDO' && (!keep || before?.role !== 'VENDIDO')) {
        await tx.vehicle.updateMany({ where: { id: vehicleId, stockStatus: { notIn: ['VENDIDO'] as never[] } }, data: { stockStatus: 'EM_NEGOCIACAO' as never } })
        out.held.push(vehicleId)
      }
    }
  }

  // ── Veículo recebido na troca ──
  if (args.tradeInVehicle !== undefined) {
    const current = rows.find((r) => r.role === 'TROCA') ?? null
    const t = type === 'TROCA' ? args.tradeInVehicle : null
    const hasCar = !!t && !!(normPlate(t.plate) || t.brand)
    if (!hasCar) {
      if (current) {
        await tx.dealVehicle.delete({ where: { id: current.id } })
        out.changes.push({ field: 'tradeInVehicle', oldValue: label(current), newValue: null })
      }
    } else {
      const car = t as VehicleInput
      const keep = current && normPlate(current.plate) === normPlate(car.plate) && !!normPlate(car.plate)
      if (!keep && car.evaluationId && normPlate(car.plate)) await assertTradeEvaluationUsable(tx, car.evaluationId, String(car.plate), deal.id)
      const data = vehicleData(car, {
        role: 'TROCA',
        ...(car.vehicleId !== undefined ? { vehicleId: car.vehicleId ?? null } : {}),
        ...(car.agreedValue !== undefined ? { agreedValue: numOrNull(car.agreedValue) } : {}),
      })
      const before = current ? { ...current } : null
      if (current) await tx.dealVehicle.update({ where: { id: current.id }, data })
      else await tx.dealVehicle.create({ data: { ...data, dealId: deal.id } })
      if (!keep) out.changes.push({ field: 'tradeInVehicle', oldValue: label(before), newValue: label({ plate: car.plate }) })
    }
  }
  return out
}

/** Carro do estoque da loja para o veículo informado (procura pela placa ou cadastra). */
async function resolveStockVehicleId(tx: Tx, deal: { tenantId: string | null; unitId: string | null }, car: VehicleInput): Promise<string | null> {
  let vehicleId: string | null = car.vehicleId ?? null
  if (!vehicleId && normPlate(car.plate)) {
    const found = await tx.vehicle.findFirst({ where: { tenantId: deal.tenantId ?? undefined, plate: String(car.plate).toUpperCase() }, select: { id: true } })
    vehicleId = found?.id ?? (await tx.vehicle.create({
      data: {
        tenantId: deal.tenantId, unitId: deal.unitId, plate: String(car.plate).toUpperCase(),
        brand: car.brand ?? null, model: car.model ?? null, year: car.year ? Number(car.year) : null,
        color: car.color ?? null, km: car.km ? Number(car.km) : null,
      },
      select: { id: true },
    })).id
  }
  if (vehicleId) {
    const owned = await tx.vehicle.findFirst({ where: { id: vehicleId, ...(deal.tenantId ? { tenantId: deal.tenantId } : {}) }, select: { id: true } })
    if (!owned) throw new Error('Veículo não encontrado no estoque desta loja.')
  }
  return vehicleId
}

const duplicated = (plate: unknown): never => {
  throw new Error(`O veículo ${normPlate(plate) || ''} foi informado duas vezes nesta negociação.`.replace('  ', ' '))
}

/**
 * Sincroniza TODOS os veículos de um papel (vendidos/comprados ou da troca) com a lista da tela:
 * mesmo carro → atualiza; carro novo → entra com as travas; carro que sumiu → sai (e volta ao estoque).
 */
async function syncVehicleList(
  tx: Tx, deal: { id: string; tenantId: string | null; unitId: string | null }, type: string, role: string,
  rows: DealVehicleRow[], inputs: VehicleInput[], out: VehicleSyncResult,
) {
  const isTrade = role === 'TROCA'
  const field = isTrade ? 'tradeInVehicle' : 'vehicle'
  const left = [...rows]
  const seen = new Set<string>()
  for (const car of inputs) {
    const key = (isTrade ? '' : car.vehicleId) || normPlate(car.plate)
    if (key) { if (seen.has(key)) duplicated(car.plate); seen.add(key) }
    const idx = left.findIndex((r) => (isTrade ? !!normPlate(car.plate) && normPlate(r.plate) === normPlate(car.plate) : sameCar(r, car)))
    const current = idx >= 0 ? left.splice(idx, 1)[0] : null
    if (isTrade) {
      if (!current && car.evaluationId && normPlate(car.plate)) await assertTradeEvaluationUsable(tx, car.evaluationId, String(car.plate), deal.id)
      const data = vehicleData(car, {
        role: 'TROCA',
        ...(car.vehicleId !== undefined ? { vehicleId: car.vehicleId ?? null } : {}),
        ...(car.agreedValue !== undefined ? { agreedValue: numOrNull(car.agreedValue) } : {}),
      })
      if (current) await tx.dealVehicle.update({ where: { id: current.id }, data })
      else {
        await tx.dealVehicle.create({ data: { ...data, dealId: deal.id } })
        out.changes.push({ field, oldValue: null, newValue: label({ plate: car.plate }) })
      }
      continue
    }
    const vehicleId = await resolveStockVehicleId(tx, deal, { ...car, vehicleId: car.vehicleId ?? current?.vehicleId ?? null })
    if (!current || current.role !== role) {
      if (vehicleId && (type === 'VENDA' || type === 'TROCA')) await assertVehicleNotInOtherSale(tx, vehicleId, deal.id)
      if (type === 'COMPRA' || type === 'CONSIGNACAO') await assertNoOtherEntryDeal(tx, deal.tenantId, { vehicleId, plate: car.plate }, deal.id)
    }
    const data = vehicleData(car, { vehicleId, role, ...(car.agreedValue !== undefined ? { agreedValue: numOrNull(car.agreedValue) } : {}) })
    if (current) await tx.dealVehicle.update({ where: { id: current.id }, data })
    else {
      await tx.dealVehicle.create({ data: { ...data, dealId: deal.id } })
      out.changes.push({ field, oldValue: null, newValue: label({ plate: car.plate, vehicleId }) })
    }
    if (vehicleId && role === 'VENDIDO' && (!current || current.role !== 'VENDIDO')) {
      await tx.vehicle.updateMany({ where: { id: vehicleId, stockStatus: { notIn: ['VENDIDO'] as never[] } }, data: { stockStatus: 'EM_NEGOCIACAO' as never } })
      out.held.push(vehicleId)
    }
  }
  // O que ficou de fora saiu da negociação.
  for (const r of left) {
    await tx.dealVehicle.delete({ where: { id: r.id } })
    if (r.vehicleId && r.role === 'VENDIDO' && await releaseStock(tx, r.vehicleId, deal.id)) out.released.push(r.vehicleId)
    out.changes.push({ field, oldValue: label(r), newValue: null })
  }
}

/**
 * Criação (POST): veículos adicionais da negociação — mais carros vendidos/comprados
 * e mais carros recebidos na troca, com as mesmas travas do principal.
 * Devolve os carros do estoque que ficaram EM_NEGOCIACAO.
 */
export async function createExtraDealVehicles(tx: Tx, args: {
  deal: { id: string; tenantId: string | null; unitId: string | null }
  type: string
  vehicles?: VehicleInput[] | null
  tradeIns?: VehicleInput[] | null
}): Promise<string[]> {
  const { deal, type } = args
  const role = VEHICLE_ROLE_BY_TYPE[type] ?? 'VENDIDO'
  const held: string[] = []
  const rows: DealVehicleRow[] = await tx.dealVehicle.findMany({ where: { dealId: deal.id }, select: { id: true, role: true, vehicleId: true, plate: true } })
  const usedIds = new Set(rows.map((r) => r.vehicleId).filter(Boolean) as string[])
  const usedPlates = new Set(rows.map((r) => normPlate(r.plate)).filter(Boolean))

  for (const car of (Array.isArray(args.vehicles) ? args.vehicles : []).slice(0, 20)) {
    if (!car || !(car.vehicleId || normPlate(car.plate) || car.brand)) continue
    const vehicleId = await resolveStockVehicleId(tx, deal, car)
    if ((vehicleId && usedIds.has(vehicleId)) || (normPlate(car.plate) && usedPlates.has(normPlate(car.plate)))) duplicated(car.plate)
    if (vehicleId) usedIds.add(vehicleId)
    if (normPlate(car.plate)) usedPlates.add(normPlate(car.plate))
    if (vehicleId && (type === 'VENDA' || type === 'TROCA')) await assertVehicleNotInOtherSale(tx, vehicleId)
    if (type === 'COMPRA' || type === 'CONSIGNACAO') await assertNoOtherEntryDeal(tx, deal.tenantId, { vehicleId, plate: car.plate })
    await tx.dealVehicle.create({ data: { ...vehicleData(car, { vehicleId, role, agreedValue: numOrNull(car.agreedValue) }), dealId: deal.id } })
    if (vehicleId && role === 'VENDIDO') {
      await tx.vehicle.updateMany({ where: { id: vehicleId, stockStatus: { notIn: ['VENDIDO'] as never[] } }, data: { stockStatus: 'EM_NEGOCIACAO' as never } })
      held.push(vehicleId)
    }
  }
  if (type === 'TROCA') {
    for (const car of (Array.isArray(args.tradeIns) ? args.tradeIns : []).slice(0, 20)) {
      if (!car || !(normPlate(car.plate) || car.brand)) continue
      if (normPlate(car.plate) && usedPlates.has(normPlate(car.plate))) duplicated(car.plate)
      if (normPlate(car.plate)) usedPlates.add(normPlate(car.plate))
      if (car.evaluationId && normPlate(car.plate)) await assertTradeEvaluationUsable(tx, car.evaluationId, String(car.plate))
      await tx.dealVehicle.create({ data: { ...vehicleData(car, { role: 'TROCA', vehicleId: car.vehicleId ?? null, agreedValue: numOrNull(car.agreedValue) }), dealId: deal.id } })
    }
  }
  return held
}

// ── Pagamentos ────────────────────────────────────────────────────────────────

export interface PaymentInput {
  id?: string | null; type?: string; amount?: number | string | null; value?: number | string | null
  dueDate?: string | null; bank?: string | null; cardBrand?: string | null; pixKey?: string | null
  agency?: string | null; account?: string | null
  installments?: number | string | null; installmentValue?: number | string | null; installmentIntervalDays?: number | string | null
  firstDueDate?: string | null; returnPct?: number | string | null; vehiclePlate?: string | null; notes?: string | null
  signalMethod?: string | null; authorizationCode?: string | null
  receipt?: { storageKey?: string; publicUrl?: string; fileName?: string; fileType?: string; mimeType?: string; fileSize?: number } | null
}

function paymentFields(p: PaymentInput) {
  let returnPct: number | null = null
  if (p.returnPct != null && p.returnPct !== '') {
    const n = Number(p.returnPct)
    if (Number.isFinite(n)) returnPct = Math.min(6, Math.max(0, Math.round(n * 100) / 100))
  }
  const type = String(p.type ?? 'OUTROS').toUpperCase()
  return {
    type,
    value:                   Number(p.amount ?? p.value ?? 0),
    method:                  ['SINAL', 'ENTRADA'].includes(type) && p.signalMethod ? String(p.signalMethod).toUpperCase().slice(0, 30) : null,
    authorizationCode:       p.authorizationCode ? String(p.authorizationCode).trim().slice(0, 40) : null,
    bank:                    p.bank      || null,
    cardBrand:               p.cardBrand || null,
    pixKey:                  p.pixKey    || null,
    agency:                  p.agency    || null,
    account:                 p.account   || null,
    installments:            p.installments ? Number(p.installments) : null,
    installmentValue:        p.installmentValue != null && p.installmentValue !== '' ? Number(p.installmentValue) : null,
    installmentIntervalDays: p.installmentIntervalDays ? Number(p.installmentIntervalDays) : null,
    returnPct,
    vehiclePlate:            p.vehiclePlate || null,
    firstDueDate:            parseDateOnly(p.firstDueDate),
    dueDate:                 parseDateOnly(p.dueDate),
    notes:                   p.notes || null,
  }
}

type Uploader = { id: string; name?: string | null; tenantId: string | null }

const isPendingUpload = (key: unknown, tenantId: string | null) =>
  typeof key === 'string' && (key.startsWith(`${BLOB_PREFIX}${pendingFolder(tenantId ?? '')}`) || key.startsWith(`deals/pending/${tenantId}/`))

async function attachReceipt(tx: Tx, dealId: string, user: Uploader, r: PaymentInput['receipt'], extra: Record<string, unknown>) {
  if (!r || !isPendingUpload(r.storageKey, user.tenantId)) return
  await tx.dealAttachment.create({
    data: {
      dealId, tenantId: user.tenantId,
      fileName: String(r.fileName ?? 'comprovante').slice(0, 160), fileType: r.fileType ?? 'other', mimeType: r.mimeType ?? 'application/octet-stream',
      fileSize: Number(r.fileSize) || null, storageKey: r.storageKey, publicUrl: r.publicUrl ?? null,
      uploadedById: user.id, uploadedByName: user.name ?? null, ...extra,
    },
  })
}

/** Cria um pagamento do wizard — sempre PENDENTE (quem confirma é o financeiro). */
export async function createWizardPayment(tx: Tx, dealId: string, user: Uploader, p: PaymentInput) {
  const created = await tx.dealPayment.create({
    data: { dealId, tenantId: user.tenantId, status: 'PENDENTE', paidAt: null, createdById: user.id, ...paymentFields(p) },
    select: { id: true },
  })
  await attachReceipt(tx, dealId, user, p.receipt, { category: 'COMPROVANTE_PAGAMENTO', paymentId: created.id })
  return created
}

// ── Débitos ───────────────────────────────────────────────────────────────────

export interface DebtInput {
  id?: string | null; vehicleRole?: string | null; type: string; description?: string | null; value: number | string
  responsavel?: string | null; notes?: string | null; dueDate?: string | null
  receipt?: PaymentInput['receipt']
}

function debtFields(d: DebtInput) {
  return {
    vehicleRole: d.vehicleRole ?? null,
    type:        d.type,
    description: d.description ?? null,
    value:       Number(d.value),
    dueDate:     d.dueDate ? new Date(`${String(d.dueDate).slice(0, 10)}T12:00:00`) : null,
    responsavel: d.responsavel ?? 'LOJA',
    notes:       d.notes ?? null,
  }
}

const debtCategory = (type: string) => (String(type).toUpperCase() === 'FINANCIAMENTO' ? 'COMPROVANTE_QUITACAO' : 'COMPROVANTE_DEBITO')

export async function createWizardDebt(tx: Tx, dealId: string, user: Uploader, d: DebtInput) {
  const created = await tx.dealDebt.create({ data: { dealId, ...debtFields(d) }, select: { id: true } })
  await attachReceipt(tx, dealId, user, d.receipt, { category: debtCategory(d.type), fileName: String(d.receipt?.fileName ?? 'boleto').slice(0, 160), debtId: created.id })
  return created
}
