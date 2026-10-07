// =============================================================================
// Transfer Gateway (serviço): transferência de propriedade após a venda.
// Saída RENAVE → intenção → ATPV-e → assinaturas → vistoria → taxas →
// transferência → novo CRLV-e. A tela só vê a etapa atual.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { opsContext } from './config'
import { runExternal } from './external'
import { transferProvider } from './gateways/registry'
import type { ManualInput } from './gateways/types'
import { applyToOperation, OpsError, type Actor } from './operations'
import { buyerInstructions, canAdvance, STAGE_DONE_LABEL, stageTimeline, type TransferStage } from './transfer-core'

export async function transferRules(tenantId: string, unitId: string | null) {
  const { caps } = await opsContext(tenantId, unitId)
  return { inspectionRequired: caps['transfer.inspectionRequired'] }
}

export async function advanceTransfer(opId: string, tenantId: string | null, stage: string, manual: ManualInput | undefined, actor: Actor) {
  const op = await prisma.vehicleOperation.findFirst({ where: { id: opId, ...(tenantId ? { tenantId } : {}) } })
  if (!op) throw new OpsError('Operação não encontrada.', 404)
  if (op.kind !== 'SALE' || op.transferStatus === 'NOT_APPLICABLE') throw new OpsError('Esta operação não tem transferência.', 409)
  if (op.cancelledAt || op.commercialStatus !== 'SOLD') throw new OpsError('A transferência começa depois de finalizar a venda.', 409)
  if (stage === 'INTENT_REGISTERED' && op.renaveStatus !== 'EXIT_CONFIRMED' && op.renaveStatus !== 'NOT_REQUIRED') {
    throw new OpsError('Registre a saída no RENAVE antes de iniciar a transferência.', 409, { action: 'renave.exit' })
  }
  const rules = await transferRules(op.tenantId, op.unitId)
  if (op.transferStatus === stage) return op // clique duplo
  const ok = canAdvance(op.transferStatus, stage, rules)
  if (!ok.ok) throw new OpsError(ok.reason, 409)

  const { cfg } = await opsContext(op.tenantId, op.unitId)
  const provider = transferProvider(cfg.providers.transfer)
  const ctx = { tenantId: op.tenantId, unitId: op.unitId }
  const started = await prisma.externalOperation.findFirst({ where: { operationId: op.id, domain: 'TRANSFER', action: 'START_TRANSFER', state: 'CONFIRMED' }, select: { externalId: true } })
  const out = await runExternal(
    { tenantId: op.tenantId, operationId: op.id, vehicleId: op.vehicleId, domain: 'TRANSFER', action: stage === 'INTENT_REGISTERED' ? 'START_TRANSFER' : `STAGE_${stage}`, providerId: provider.info.id, providerMode: provider.info.mode, baseKey: `TRANSFER:${stage}:${op.id}`, actor, request: { stage, manual } },
    () => stage === 'INTENT_REGISTERED'
      ? provider.startTransfer(ctx, { vehicle: { vehicleId: op.vehicleId }, buyer: {}, manual })
      : provider.recordStage(ctx, started?.externalId ?? null, stage, manual),
  )
  if (out.ext.state !== 'CONFIRMED') throw new OpsError(out.ext.userMessage ?? 'Não foi possível registrar a etapa.', 422)

  return applyToOperation(op.id, {
    transferStatus: stage, transferStage: stage,
    ...(stage === 'INSPECTION_DONE' ? { inspectionStatus: 'VALID' } : {}),
    ...(stage === 'CRLV_ISSUED' ? { closedAt: new Date(), commercialStatus: 'SOLD' } : {}),
  }, { actor, type: 'TRANSFER_STAGE', title: `${STAGE_DONE_LABEL[stage as TransferStage]}${manual?.protocol ? ` (${manual.protocol})` : ''}.`, detail: manual?.notes ?? null, providerId: provider.info.id, externalOperationId: out.ext.id })
}

export async function transferView(op: { tenantId: string; unitId: string | null; transferStatus: string }) {
  if (op.transferStatus === 'NOT_APPLICABLE') return null
  return stageTimeline(op.transferStatus, await transferRules(op.tenantId, op.unitId))
}

/** Texto + telefone do comprador para "Enviar instruções" (WhatsApp do próprio usuário). */
export async function transferInstructions(opId: string, tenantId: string | null) {
  const op = await prisma.vehicleOperation.findFirst({ where: { id: opId, ...(tenantId ? { tenantId } : {}) } })
  if (!op) throw new OpsError('Operação não encontrada.', 404)
  const [vehicle, customer, tenant] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: op.vehicleId }, select: { brand: true, model: true, plate: true } }),
    op.customerId ? prisma.customer.findUnique({ where: { id: op.customerId }, select: { name: true, phone: true } }) : null,
    prisma.tenant.findUnique({ where: { id: op.tenantId }, select: { name: true } }),
  ])
  const text = buyerInstructions({ buyerName: customer?.name, vehicle: `${vehicle?.brand ?? ''} ${vehicle?.model ?? ''}`.trim(), plate: vehicle?.plate, storeName: tenant?.name })
  const digits = (customer?.phone ?? '').replace(/\D/g, '')
  const phone = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : null
  return { text, phone, buyerName: customer?.name ?? null }
}
