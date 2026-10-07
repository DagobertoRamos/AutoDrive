// =============================================================================
// Emissão de NF-e pelo emissor conectado da loja (Focus, PlugNotas, Nuvem/ACBr).
//   prévia → o que vai na nota (CFOP, valor, ICMS) e o que falta cadastrar
//   emitir → rascunho neutro → adapter; nota fica "em processamento"
//   atualizar (job/webhook/tela) → autorizada: baixa o XML, confere com a
//     operação e vincula; rejeitada: mostra o motivo traduzido.
// Sem conexão de API, o caminho continua sendo importar o XML (fiscal.ts).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { opsContext, storeDocs } from './config'
import { providerContext } from './connections'
import { translateProviderError } from './errors-core'
import { runExternal } from './external'
import { normalizeFiscalRules, icmsReductionOn, type FiscalOperation } from './fiscal-rules'
import { fiscalProvider } from './gateways/registry'
import { buildNfeDraft, missingForDraft, tPagOf, type DraftInput, type Party } from './nfe-draft'
import { checkNfeForOperation, parseNfeXml } from './nfe-xml-core'
import { applyToOperation, OpsError, recordEvent, SYSTEM_ACTOR, type Actor } from './operations'
import { providerEntry } from './providers-catalog'

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

async function ibge(cep: string | null | undefined): Promise<string | null> {
  const c = digits(cep)
  if (c.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
    const j = await r.json() as { ibge?: string }
    return j?.ibge ?? null
  } catch { return null }
}

async function operationFor(op: { kind: string; vehicleId: string }): Promise<FiscalOperation> {
  if (op.kind === 'SALE') {
    const v = await prisma.vehicle.findUnique({ where: { id: op.vehicleId }, select: { stockType: true } })
    return v?.stockType === 'CONSIGNADO' ? 'CONSIGNED_SALE' : 'SALE'
  }
  if (op.kind === 'CONSIGNMENT') return 'CONSIGNMENT_IN'
  if (op.kind === 'STORE_TRANSFER') return 'TRANSFER_OUT'
  return 'PURCHASE'
}

/** Quem está do outro lado da nota, com endereço. */
async function counterpartOf(op: { kind: string; dealId: string | null; customerId: string | null; vehicleId: string }): Promise<Party> {
  const deal = op.dealId ? await prisma.deal.findUnique({ where: { id: op.dealId }, select: { person: true, customer: { select: { name: true, cpf: true, phone: true, email: true, address: true, city: true, state: true } } } }) : null
  const p = deal?.person
  if (p) {
    const pj = p.type === 'JURIDICA'
    return {
      name: (pj ? p.razaoSocial : p.nomeCompleto) ?? p.nomeCompleto, doc: digits(pj ? p.cnpj : p.cpf), ie: pj && p.possuiIE ? p.inscricaoEstadual : null,
      street: p.logradouro, number: p.numero, complement: p.complemento, district: p.bairro, city: p.cidade, uf: p.estado, zip: p.cep,
      cityCode: await ibge(p.cep), phone: p.phone, email: p.email,
    }
  }
  const c = deal?.customer ?? (op.customerId ? await prisma.customer.findUnique({ where: { id: op.customerId }, select: { name: true, cpf: true, phone: true, email: true, address: true, city: true, state: true } }) : null)
  if (c) return { name: c.name, doc: digits(c.cpf), street: c.address, number: null, district: null, city: c.city, uf: c.state, zip: null, phone: c.phone, email: c.email }
  const v = await prisma.vehicle.findUnique({ where: { id: op.vehicleId }, select: { originEvaluationId: true } })
  const ev = v?.originEvaluationId ? await prisma.vehicleEvaluation.findUnique({ where: { id: v.originEvaluationId }, select: { ownerName: true, ownerCpf: true, ownerPhone: true, ownerEmail: true } }) : null
  return { name: ev?.ownerName ?? '', doc: digits(ev?.ownerCpf), phone: ev?.ownerPhone ?? null, email: ev?.ownerEmail ?? null }
}

async function draftInputFor(opId: string, tenantId: string | null) {
  const op = await prisma.vehicleOperation.findFirst({ where: { id: opId, ...(tenantId ? { tenantId } : {}) } })
  if (!op) throw new OpsError('Operação não encontrada.', 404)
  const [ctx, tenant, vehicle, dv, payments] = await Promise.all([
    opsContext(op.tenantId, op.unitId),
    prisma.tenant.findUnique({ where: { id: op.tenantId }, select: { cnpj: true, inscricaoEstadual: true, state: true } }),
    prisma.vehicle.findUnique({ where: { id: op.vehicleId }, select: { brand: true, model: true, version: true, year: true, modelYear: true, color: true, plate: true, chassi: true, renavam: true, km: true, purchasePrice: true } }),
    op.dealVehicleId ? prisma.dealVehicle.findUnique({ where: { id: op.dealVehicleId }, select: { agreedValue: true } }) : null,
    op.dealId && op.kind === 'SALE' ? prisma.dealPayment.findMany({ where: { dealId: op.dealId, NOT: { status: 'CANCELADO' } }, select: { type: true, value: true } }) : [],
  ])
  const unitCfg = op.unitId ? ctx.cfg.units[op.unitId] : undefined
  const unitDoc = op.unitId ? (await prisma.unit.findUnique({ where: { id: op.unitId }, select: { cnpj: true } }))?.cnpj : null
  const rules = normalizeFiscalRules(ctx.cfg.fiscalRules, ctx.uf)
  const amount = dv?.agreedValue != null ? Number(dv.agreedValue) : vehicle?.purchasePrice != null ? Number(vehicle.purchasePrice) : 0
  const pays = payments.map((p) => ({ method: tPagOf(p.type), amount: Math.round(Number(p.value) * 100) / 100 })).filter((p) => p.amount > 0)
  const paySum = pays.reduce((s, p) => s + p.amount, 0)
  const operation = await operationFor(op)
  const input: DraftInput = {
    reference: op.code, operation, rules,
    issuer: { cnpj: digits(unitDoc && digits(unitDoc).length === 14 ? unitDoc : tenant?.cnpj), ie: unitCfg?.ie ?? tenant?.inscricaoEstadual ?? null, uf: unitCfg?.uf ?? ctx.uf ?? tenant?.state ?? null },
    counterpart: await counterpartOf(op),
    vehicle: vehicle ?? {},
    amount,
    cost: vehicle?.purchasePrice != null ? Number(vehicle.purchasePrice) : null,
    payments: Math.abs(paySum - amount) < 0.01 ? pays : [{ method: '99', amount }],
  }
  return { op, input, rules }
}

export async function fiscalPreview(opId: string, tenantId: string | null) {
  const { op, input, rules } = await draftInputFor(opId, tenantId)
  const { providerId } = await providerContext(op.tenantId, 'FISCAL', op.unitId)
  const entry = providerEntry('FISCAL', providerId)
  const missing = missingForDraft(input)
  const draft = buildNfeDraft(input)
  const reduction = icmsReductionOn(rules, new Date())
  return {
    mode: entry?.mode === 'API' ? 'API' : 'MANUAL',
    providerName: entry?.name ?? 'Emissor próprio',
    missing,
    rulesConfirmed: !!rules.confirmedAt,
    reductionExpired: reduction.expired,
    summary: {
      nature: draft.nature, type: draft.type, cfop: draft.item.cfop, ncm: draft.item.ncm, amount: draft.item.amount,
      counterpart: { name: draft.counterpart.name, doc: draft.counterpart.doc },
      icms: draft.item.icms, regime: rules.regime,
    },
  }
}

export async function emitFiscal(opId: string, tenantId: string | null, actor: Actor) {
  const { op, input } = await draftInputFor(opId, tenantId)
  if (op.cancelledAt) throw new OpsError('Operação cancelada.', 409)
  if (op.fiscalStatus === 'AUTHORIZED') throw new OpsError('Esta operação já tem NF-e autorizada.', 409)
  if (op.fiscalStatus === 'NOT_REQUIRED') throw new OpsError('Esta operação não exige nota fiscal.', 409)
  const { providerId, ctx } = await providerContext(op.tenantId, 'FISCAL', op.unitId)
  const provider = fiscalProvider(providerId)
  if (provider.info.mode !== 'API') throw new OpsError('Conecte o emissor de notas da loja em Configurações › Operações.', 409)
  const missing = missingForDraft(input)
  if (missing.length) throw new OpsError(`Falta para emitir: ${missing.join(', ')}.`, 422, { missing })
  const attempts = await prisma.externalOperation.count({ where: { operationId: op.id, domain: 'FISCAL', action: 'EMIT' } })
  const reference = `${op.code}-${attempts + 1}`
  const draft = buildNfeDraft({ ...input, reference })

  const out = await runExternal(
    { tenantId: op.tenantId, operationId: op.id, vehicleId: op.vehicleId, domain: 'FISCAL', action: 'EMIT', providerId, providerMode: 'API', baseKey: `FISCAL:EMIT:${op.id}`, actor, request: { reference, cfop: draft.item.cfop, amount: draft.item.amount, connectionId: ctx.connectionId } },
    () => provider.emit(ctx, { model: 'NFE', reference, payload: draft as unknown as Record<string, unknown> }),
    (e) => (e.externalId ? provider.status(ctx, e.externalId) : Promise.resolve(null)),
  )
  if (out.plan === 'RETURN_EXISTING' || (out.plan === 'CHECK_STATUS' && !out.result)) {
    return { status: op.fiscalStatus, message: 'A nota desta operação já está em processamento.' }
  }
  const rejected = out.ext.state === 'REJECTED'
  const friendly = rejected ? translateProviderError('FISCAL', out.ext.errorCode, out.ext.errorDetail ?? out.ext.userMessage) : null
  const doc = await prisma.fiscalDocument.create({
    data: {
      tenantId: op.tenantId, unitId: op.unitId, operationId: op.id, vehicleId: op.vehicleId, dealId: op.dealId,
      model: 'NFE', direction: draft.type, purpose: op.kind === 'SALE' ? 'SALE' : op.kind === 'CONSIGNMENT' ? 'CONSIGNMENT_IN' : op.kind === 'STORE_TRANSFER' ? 'STORE_TRANSFER' : 'PURCHASE',
      status: rejected ? 'REJECTED' : 'PROCESSING', providerId, externalOperationId: out.ext.id, cfop: draft.item.cfop, amount: draft.item.amount,
      recipientDoc: draft.counterpart.doc, recipientName: draft.counterpart.name, chassi: input.vehicle.chassi ?? null, renavam: input.vehicle.renavam ?? null, plate: input.vehicle.plate ?? null,
      rejectionCode: friendly?.code ?? null, rejectionMessage: friendly?.message ?? null, createdById: actor.id ?? null,
    },
  })
  await applyToOperation(op.id, { fiscalStatus: rejected ? 'REJECTED' : 'PROCESSING', fiscalDocumentId: doc.id }, {
    actor, type: rejected ? 'FISCAL_REJECTED' : 'FISCAL_SUBMITTED', providerId, externalOperationId: out.ext.id,
    title: rejected ? `NF-e rejeitada: ${friendly?.message}` : `NF-e enviada ao ${provider.info.label}.`,
  })
  if (rejected) throw new OpsError(friendly?.message ?? 'Nota rejeitada.', 422, { code: friendly?.code, fix: friendly?.fix })
  // Alguns emissores autorizam em segundos: tenta concluir já.
  await refreshFiscalDocument(doc.id, actor).catch(() => null)
  return { status: 'PROCESSING', documentId: doc.id }
}

/** Consulta o emissor e conclui a nota (autorizada → XML conferido e vinculado). */
export async function refreshFiscalDocument(docId: string, actor: Actor = SYSTEM_ACTOR) {
  const doc = await prisma.fiscalDocument.findUnique({ where: { id: docId } })
  if (!doc || !['PROCESSING', 'UNKNOWN'].includes(doc.status) || !doc.externalOperationId) return doc
  const ext = await prisma.externalOperation.findUnique({ where: { id: doc.externalOperationId } })
  if (!ext?.externalId) return doc
  const op = doc.operationId ? await prisma.vehicleOperation.findUnique({ where: { id: doc.operationId } }) : null
  const { ctx } = await providerContext(doc.tenantId, 'FISCAL', doc.unitId, doc.providerId)
  const provider = fiscalProvider(doc.providerId)
  let st
  try { st = await provider.status(ctx, ext.externalId) } catch { st = null }
  if (!st || st.state === 'PROCESSING' || st.state === 'UNKNOWN') {
    await prisma.externalOperation.update({ where: { id: ext.id }, data: { lastCheckedAt: new Date(), attempts: { increment: 1 }, nextCheckAt: new Date(Date.now() + 2 * 60_000) } })
    return doc
  }
  if (st.state === 'REJECTED') {
    const f = translateProviderError('FISCAL', st.errorCode ?? null, st.errorMessage ?? null)
    await prisma.externalOperation.update({ where: { id: ext.id }, data: { state: 'REJECTED', errorCode: st.errorCode ?? null, errorDetail: st.errorMessage ?? null, userMessage: f.message, nextCheckAt: null } })
    const u = await prisma.fiscalDocument.update({ where: { id: doc.id }, data: { status: 'REJECTED', rejectionCode: f.code, rejectionMessage: f.message } })
    if (op) await applyToOperation(op.id, { fiscalStatus: 'REJECTED' }, { actor, origin: 'PROVIDER', type: 'FISCAL_REJECTED', providerId: doc.providerId, externalOperationId: ext.id, title: `NF-e rejeitada: ${f.message}` })
    return u
  }
  const data = (st.data ?? {}) as { xml?: string; accessKey?: string; number?: string; series?: string }
  const parsed = data.xml && data.xml.trim().startsWith('<') ? parseNfeXml(data.xml) : null
  if (parsed && op) {
    const issues = checkNfeForOperation(parsed, { direction: doc.direction === 'OUT' ? 'OUT' : 'IN', storeDocs: await storeDocs(doc.tenantId), chassi: doc.chassi })
    const blocking = issues.filter((i) => i.blocking && i.field !== 'status')
    if (blocking.length) await recordEvent({ tenantId: doc.tenantId, vehicleId: doc.vehicleId, operationId: op.id, type: 'FISCAL_CHECK_WARNING', title: `Conferência da NF-e: ${blocking[0].message}`, origin: 'SYSTEM', actor })
  }
  await prisma.externalOperation.update({ where: { id: ext.id }, data: { state: 'CONFIRMED', confirmedAt: new Date(), protocol: st.protocol ?? undefined, nextCheckAt: null } })
  const u = await prisma.fiscalDocument.update({
    where: { id: doc.id },
    data: {
      status: 'AUTHORIZED', accessKey: parsed?.accessKey ?? data.accessKey ?? null, number: parsed?.number ?? data.number ?? null, series: parsed?.series ?? data.series ?? null,
      issuedAt: parsed?.issuedAt ?? null, authorizedAt: parsed?.authorizedAt ?? new Date(), authorizationProtocol: parsed?.protocol ?? st.protocol ?? null,
      issuerDoc: parsed?.issuerDoc ?? null, issuerName: parsed?.issuerName ?? null, xml: parsed ? data.xml : null,
    },
  })
  if (op) await applyToOperation(op.id, { fiscalStatus: 'AUTHORIZED', fiscalDocumentId: doc.id }, { actor, origin: 'PROVIDER', type: 'FISCAL_AUTHORIZED', providerId: doc.providerId, externalOperationId: ext.id, title: `NF-e ${u.number ?? ''}${u.series ? `/${u.series}` : ''} autorizada.`.replace('  ', ' ') })
  return u
}

/** Job/webhook: atualiza as notas em processamento da loja. */
export async function refreshPendingFiscal(tenantId?: string, limit = 40) {
  const docs = await prisma.fiscalDocument.findMany({ where: { status: { in: ['PROCESSING', 'UNKNOWN'] }, ...(tenantId ? { tenantId } : {}) }, orderBy: { updatedAt: 'asc' }, take: limit, select: { id: true } })
  let n = 0
  for (const d of docs) {
    const r = await refreshFiscalDocument(d.id).catch(() => null)
    if (r && r.status !== 'PROCESSING') n++
  }
  return n
}
