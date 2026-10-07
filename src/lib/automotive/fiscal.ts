// =============================================================================
// Fiscal Core (serviço). A tela nunca fala com Focus/Nuvem Fiscal/PlugNotas:
// fala com estas funções, que usam o provedor fiscal da loja (gateways).
// Toda nota é conferida contra a operação antes de vincular — chave única
// global: a mesma NF-e nunca fica em dois veículos.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { opsContext, storeDocs } from './config'
import { runExternal } from './external'
import { fiscalProvider } from './gateways/registry'
import { checkNfeForOperation, parseNfeXml, type NfeIssue } from './nfe-xml-core'
import { applyToOperation, OpsError, recordEvent, type Actor } from './operations'

const MAX_XML = 1_000_000

const PURPOSE: Record<string, string> = { SALE: 'SALE', PURCHASE: 'PURCHASE', CONSIGNMENT: 'CONSIGNMENT_IN', STORE_TRANSFER: 'STORE_TRANSFER' }

/** CPF/CNPJ de quem está do outro lado da operação. */
async function counterpartDoc(op: { kind: string; dealId: string | null; customerId: string | null; vehicleId: string }): Promise<string | null> {
  const customerId = op.customerId ?? (op.dealId ? (await prisma.deal.findUnique({ where: { id: op.dealId }, select: { customerId: true } }))?.customerId : null)
  if (customerId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { cpf: true } })
    if (c?.cpf) return c.cpf
  }
  if (op.kind !== 'SALE') {
    const v = await prisma.vehicle.findUnique({ where: { id: op.vehicleId }, select: { originEvaluationId: true } })
    if (v?.originEvaluationId) return (await prisma.vehicleEvaluation.findUnique({ where: { id: v.originEvaluationId }, select: { ownerCpf: true } }))?.ownerCpf ?? null
  }
  return null
}

export interface AttachResult { documentId: string; warnings: NfeIssue[] }

/** Vincula o XML autorizado da NF-e à operação (provedor manual ou retorno de emissão). */
export async function attachFiscalXml(opId: string, tenantId: string | null, xml: string, actor: Actor): Promise<AttachResult> {
  if (!xml?.trim()) throw new OpsError('Envie o XML da NF-e.', 400)
  if (xml.length > MAX_XML) throw new OpsError('Arquivo grande demais para um XML de NF-e.', 400)
  const op = await prisma.vehicleOperation.findFirst({ where: { id: opId, ...(tenantId ? { tenantId } : {}) } })
  if (!op) throw new OpsError('Operação não encontrada.', 404)
  if (op.cancelledAt) throw new OpsError('Operação cancelada.', 409)
  if (op.fiscalStatus === 'NOT_REQUIRED') throw new OpsError('Esta operação não exige nota fiscal.', 409)
  if (op.fiscalStatus === 'AUTHORIZED') throw new OpsError('Esta operação já tem NF-e autorizada. Cancele a nota atual antes de vincular outra.', 409)

  const parsed = parseNfeXml(xml)
  const [docs, counterpart, vehicle, dv] = await Promise.all([
    storeDocs(op.tenantId),
    counterpartDoc(op),
    prisma.vehicle.findUnique({ where: { id: op.vehicleId }, select: { chassi: true, renavam: true, plate: true } }),
    op.dealVehicleId ? prisma.dealVehicle.findUnique({ where: { id: op.dealVehicleId }, select: { agreedValue: true } }) : null,
  ])
  const direction = op.kind === 'SALE' || op.kind === 'STORE_TRANSFER' ? 'OUT' : 'IN'
  const issues = checkNfeForOperation(parsed, { direction, storeDocs: docs, counterpartDoc: counterpart, chassi: vehicle?.chassi, amount: dv?.agreedValue ? Number(dv.agreedValue) : null })
  const blocking = issues.filter((i) => i.blocking)
  if (blocking.length) throw new OpsError(blocking[0].message, 422, { issues })

  if (parsed.accessKey) {
    const dup = await prisma.fiscalDocument.findUnique({ where: { accessKey: parsed.accessKey }, select: { id: true, operationId: true } })
    if (dup) {
      const other = dup.operationId ? await prisma.vehicleOperation.findUnique({ where: { id: dup.operationId }, select: { code: true } }) : null
      throw new OpsError(dup.operationId === op.id ? 'Esta nota já está vinculada a esta operação.' : `Esta nota já está vinculada à operação ${other?.code ?? 'de outro veículo'}.`, 409)
    }
  }

  const { cfg } = await opsContext(op.tenantId, op.unitId)
  const provider = fiscalProvider(cfg.providers.fiscal)
  const out = await runExternal(
    { tenantId: op.tenantId, operationId: op.id, vehicleId: op.vehicleId, domain: 'FISCAL', action: 'EMIT', providerId: provider.info.id, providerMode: provider.info.mode, baseKey: `FISCAL:EMIT:${parsed.accessKey}`, actor, request: { accessKey: parsed.accessKey, number: parsed.number } },
    () => provider.emit({ tenantId: op.tenantId, unitId: op.unitId }, { model: 'NFE', reference: op.code, xml }),
  )
  if (out.ext.state !== 'CONFIRMED') throw new OpsError(out.ext.userMessage ?? 'Nota não autorizada.', 422)

  let doc
  try {
    doc = await prisma.fiscalDocument.create({
      data: {
        tenantId: op.tenantId, unitId: op.unitId, operationId: op.id, vehicleId: op.vehicleId, dealId: op.dealId,
        model: 'NFE', direction, purpose: PURPOSE[op.kind] ?? null, status: 'AUTHORIZED', providerId: provider.info.id, externalOperationId: out.ext.id,
        number: parsed.number, series: parsed.series, accessKey: parsed.accessKey, cfop: parsed.cfop, amount: parsed.amount ?? undefined,
        issuerDoc: parsed.issuerDoc, issuerName: parsed.issuerName, recipientDoc: parsed.recipientDoc, recipientName: parsed.recipientName,
        chassi: parsed.chassi ?? vehicle?.chassi ?? null, renavam: vehicle?.renavam ?? null, plate: vehicle?.plate ?? null,
        issuedAt: parsed.issuedAt, authorizedAt: parsed.authorizedAt, authorizationProtocol: parsed.protocol, xml, createdById: actor.id ?? null,
      },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw new OpsError('Esta nota já foi vinculada.', 409)
    throw err
  }

  await applyToOperation(op.id, { fiscalStatus: 'AUTHORIZED', fiscalDocumentId: doc.id }, {
    actor, type: 'FISCAL_AUTHORIZED', title: `NF-e ${parsed.number ?? ''}${parsed.series ? `/${parsed.series}` : ''} vinculada (${direction === 'OUT' ? 'saída' : 'entrada'}).`.replace('  ', ' '),
    providerId: provider.info.id, externalOperationId: out.ext.id,
  })
  return { documentId: doc.id, warnings: issues.filter((i) => !i.blocking) }
}

/** Cancela a nota (evento homologado ou protocolo). Nunca apaga: marca CANCELLED. */
export async function cancelFiscalDocument(docId: string, tenantId: string | null, input: { reason: string; eventXml?: string | null; protocol?: string | null }, actor: Actor) {
  const doc = await prisma.fiscalDocument.findFirst({ where: { id: docId, ...(tenantId ? { tenantId } : {}) } })
  if (!doc) throw new OpsError('Nota não encontrada.', 404)
  if (doc.status === 'CANCELLED') return doc
  if (!input.reason?.trim() || input.reason.trim().length < 15) throw new OpsError('Informe o motivo do cancelamento (mínimo 15 caracteres).', 400)
  const provider = fiscalProvider(doc.providerId)
  if (provider.info.mode === 'MANUAL' && !input.eventXml && !input.protocol?.trim()) throw new OpsError('Envie o XML do cancelamento ou informe o protocolo.', 400)
  const out = await runExternal(
    { tenantId: doc.tenantId, operationId: doc.operationId, vehicleId: doc.vehicleId, domain: 'FISCAL', action: 'CANCEL', providerId: provider.info.id, providerMode: provider.info.mode, baseKey: `FISCAL:CANCEL:${doc.accessKey ?? doc.id}`, actor, request: { reason: input.reason } },
    () => provider.cancel({ tenantId: doc.tenantId, unitId: doc.unitId }, doc.accessKey ?? doc.id, input.reason, { eventXml: input.eventXml ?? null, protocol: input.protocol ?? null }),
  )
  if (out.ext.state !== 'CANCELLED' && out.ext.state !== 'CONFIRMED') throw new OpsError(out.ext.userMessage ?? 'Não foi possível cancelar a nota.', 422)
  const updated = await prisma.fiscalDocument.update({ where: { id: doc.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason.trim().slice(0, 500) } })
  if (doc.operationId) {
    const op = await prisma.vehicleOperation.findUnique({ where: { id: doc.operationId }, select: { id: true, cancelledAt: true, fiscalDocumentId: true } })
    if (op && op.fiscalDocumentId === doc.id) {
      await applyToOperation(op.id, { fiscalStatus: op.cancelledAt ? 'CANCELLED' : 'PENDING', fiscalDocumentId: null }, { actor, type: 'FISCAL_CANCELLED', title: `NF-e ${doc.number ?? ''} cancelada.`, detail: input.reason, externalOperationId: out.ext.id })
    }
  } else {
    await recordEvent({ tenantId: doc.tenantId, vehicleId: doc.vehicleId, type: 'FISCAL_CANCELLED', title: `NF-e ${doc.number ?? ''} cancelada.`, detail: input.reason, actor })
  }
  return updated
}
