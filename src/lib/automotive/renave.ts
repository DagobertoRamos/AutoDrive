// =============================================================================
// RENAVE Gateway (serviço). Telas chamam estas funções; o provedor é o da loja
// (renaveProviderId fica gravado na operação: o ciclo iniciado com uma
// integradora continua nela até terminar).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { opsContext } from './config'
import { runExternal } from './external'
import { renaveProvider } from './gateways/registry'
import type { ManualInput } from './gateways/types'
import { applyToOperation, ensureIntakeOperation, OpsError, recordEvent, vehicleRenaveFacts, type Actor } from './operations'

export type RenaveAction = 'ENTRY' | 'EXIT' | 'CANCEL'

function cleanManual(m: ManualInput | undefined): ManualInput {
  return {
    protocol: m?.protocol?.trim().slice(0, 80) || null,
    date: m?.date && !isNaN(Date.parse(m.date)) ? m.date : null,
    notes: m?.notes?.trim().slice(0, 500) || null,
  }
}

async function loadOp(opId: string, tenantId: string | null) {
  const op = await prisma.vehicleOperation.findFirst({ where: { id: opId, ...(tenantId ? { tenantId } : {}) } })
  if (!op) throw new OpsError('Operação não encontrada.', 404)
  const vehicle = await prisma.vehicle.findUnique({ where: { id: op.vehicleId }, select: { id: true, plate: true, chassi: true, renavam: true } })
  return { op, vehicle: vehicle! }
}

/** Entrada pelo veículo (carro de estoque sem operação de entrada ainda). */
export async function renaveEntryForVehicle(vehicleId: string, tenantId: string | null, manual: ManualInput, actor: Actor) {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, ...(tenantId ? { tenantId } : {}) }, select: { id: true } })
  if (!v) throw new OpsError('Veículo não encontrado.', 404)
  const op = await ensureIntakeOperation(vehicleId, actor)
  return renaveAction(op.id, tenantId, 'ENTRY', manual, actor)
}

export async function renaveAction(opId: string, tenantId: string | null, action: RenaveAction, manualIn: ManualInput | undefined, actor: Actor, reason?: string) {
  const { op, vehicle } = await loadOp(opId, tenantId)
  const manual = cleanManual(manualIn)
  const { cfg } = await opsContext(op.tenantId, op.unitId)
  const providerId = op.renaveProviderId ?? cfg.providers.renave
  const provider = renaveProvider(providerId)
  if (op.renaveStatus === 'NOT_REQUIRED') throw new OpsError('Esta operação não exige RENAVE.', 409)
  if (provider.info.mode === 'MANUAL' && action !== 'CANCEL' && !manual.protocol) throw new OpsError('Informe o protocolo do RENAVE.', 400)

  const sale = op.kind === 'SALE'
  const vref = { vehicleId: vehicle.id, plate: vehicle.plate, chassi: vehicle.chassi, renavam: vehicle.renavam }
  const fiscal = op.fiscalDocumentId ? await prisma.fiscalDocument.findUnique({ where: { id: op.fiscalDocumentId }, select: { accessKey: true } }) : null

  if (action === 'ENTRY') {
    if (sale) throw new OpsError('Entrada no RENAVE é registrada na operação de entrada do veículo.', 400)
    if (op.cancelledAt) throw new OpsError('Operação cancelada.', 409)
    if (op.renaveStatus === 'ENTRY_CONFIRMED') return op
  } else if (action === 'EXIT') {
    if (!sale) throw new OpsError('Saída no RENAVE é registrada na venda.', 400)
    if (op.cancelledAt || op.commercialStatus !== 'SOLD') throw new OpsError('Registre a saída depois de finalizar a venda.', 409)
    if (op.renaveStatus === 'EXIT_CONFIRMED') return op
    if (op.fiscalStatus !== 'AUTHORIZED' && op.fiscalStatus !== 'NOT_REQUIRED') throw new OpsError('Vincule a NF-e de saída antes de registrar a saída no RENAVE.', 409)
    const facts = await vehicleRenaveFacts(op.vehicleId)
    if (facts.renave !== 'IN') throw new OpsError('O veículo não tem entrada confirmada no RENAVE. Registre a entrada primeiro.', 409, { action: 'renave.entry', vehicleId: op.vehicleId })
  } else {
    const confirmed = sale ? op.renaveStatus === 'EXIT_CONFIRMED' : op.renaveStatus === 'ENTRY_CONFIRMED'
    if (!confirmed) throw new OpsError('Não há registro confirmado para cancelar.', 409)
    if (!reason?.trim()) throw new OpsError('Informe o motivo do cancelamento.', 400)
  }

  const verb = action === 'ENTRY' ? 'ENTER_STOCK' : action === 'EXIT' ? 'EXIT_STOCK' : sale ? 'CANCEL_EXIT' : 'CANCEL_ENTRY'
  const ext = await prisma.externalOperation.findFirst({ where: { operationId: op.id, domain: 'RENAVE', state: 'CONFIRMED', action: sale ? 'EXIT_STOCK' : 'ENTER_STOCK' }, orderBy: { createdAt: 'desc' }, select: { externalId: true } })
  const ctx = { tenantId: op.tenantId, unitId: op.unitId }
  const out = await runExternal(
    { tenantId: op.tenantId, operationId: op.id, vehicleId: op.vehicleId, domain: 'RENAVE', action: verb, providerId, providerMode: provider.info.mode, baseKey: `RENAVE:${verb}:${op.id}`, actor, request: { vehicle: vref, manual, reason: reason ?? null } },
    () => action === 'ENTRY' ? provider.enterStock(ctx, { vehicle: vref, fiscalKey: fiscal?.accessKey ?? null, manual })
      : action === 'EXIT' ? provider.exitStock(ctx, { vehicle: vref, fiscalKey: fiscal?.accessKey ?? null, manual })
      : sale ? provider.cancelExit(ctx, ext?.externalId ?? null, manual) : provider.cancelEntry(ctx, ext?.externalId ?? null, manual),
    (e) => (e.externalId ? provider.getStatus(ctx, e.externalId) : Promise.resolve(null)),
  )

  const s = out.ext.state
  const next = action === 'CANCEL'
    ? (s === 'CANCELLED' || s === 'CONFIRMED' ? 'CANCELLED' : s === 'REJECTED' ? op.renaveStatus : 'UNKNOWN')
    : s === 'CONFIRMED' ? (sale ? 'EXIT_CONFIRMED' : 'ENTRY_CONFIRMED')
    : s === 'REJECTED' ? 'REJECTED'
    : s === 'UNKNOWN' ? 'UNKNOWN'
    : sale ? 'EXIT_SUBMITTED' : 'ENTRY_SUBMITTED'

  const title = action === 'CANCEL'
    ? (next === 'CANCELLED' ? `${sale ? 'Saída' : 'Entrada'} no RENAVE cancelada.` : 'Cancelamento no RENAVE em verificação.')
    : next.endsWith('CONFIRMED') ? `${sale ? 'Saída' : 'Entrada'} confirmada no RENAVE${out.ext.protocol ? ` (protocolo ${out.ext.protocol})` : ''}.`
    : next === 'REJECTED' ? `RENAVE recusou a ${sale ? 'saída' : 'entrada'}: ${out.ext.userMessage ?? ''}`.trim()
    : next === 'UNKNOWN' ? 'Não foi possível confirmar no RENAVE. Verificando se foi processado.'
    : `${sale ? 'Saída' : 'Entrada'} enviada ao RENAVE.`

  const updated = await applyToOperation(op.id, {
    renaveStatus: next,
    renaveProviderId: providerId,
    ...(!op.renaveCycleId && out.ext.externalId ? { renaveCycleId: out.ext.externalId } : {}),
  }, { actor, title, type: `RENAVE_${action}`, providerId, externalOperationId: out.ext.id, detail: reason ?? manual.notes })

  // Registro original revertido: um novo envio da mesma ação vira nova tentativa.
  if (action === 'CANCEL' && next === 'CANCELLED') {
    await prisma.externalOperation.updateMany({ where: { operationId: op.id, domain: 'RENAVE', action: sale ? 'EXIT_STOCK' : 'ENTER_STOCK', state: 'CONFIRMED' }, data: { state: 'CANCELLED' } })
  }
  if (action === 'CANCEL' && reason) await recordEvent({ tenantId: op.tenantId, vehicleId: op.vehicleId, operationId: op.id, type: 'RENAVE_CANCEL_REASON', title: `Motivo: ${reason}`, actor })
  if (s === 'REJECTED') throw new OpsError(out.ext.userMessage ?? 'O RENAVE recusou o registro.', 422, { code: out.ext.errorCode })
  return updated
}
