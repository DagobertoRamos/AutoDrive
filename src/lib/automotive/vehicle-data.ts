// =============================================================================
// Consulta profissional de débitos e restrições do veículo (provedor da loja).
//   • reaproveita resultado recente (24 h) — cada consulta custa;
//   • consulta em andamento não é disparada de novo (clique duplo);
//   • resultado normalizado: débitos por tipo + total; restrições viram
//     VehicleRestriction (origem PROVEDOR) e entram na trava de venda;
//   • restrição que sumiu numa nova consulta do MESMO provedor é baixada
//     automaticamente (só de provedor que informa restrições);
//   • quem consultou e quando fica registrado (LGPD: finalidade = avaliação
//     ou venda do veículo; documento do proprietário não vai para log).
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { activeConnection, connectionById } from './connections'
import { vehicleDataProvider, type NormalizedRestriction, type VehicleDataResult } from './gateways/vehicle-data'
import { OpsError, recordEvent, refreshVehicleRestriction, SYSTEM_ACTOR, type Actor } from './operations'
import { providerEntry } from './providers-catalog'
import { restrictionKindText } from './readiness-core'

const CACHE_MS = 24 * 3_600_000
const INFLIGHT_MS = 15 * 60_000
const r2 = (n: number) => Math.round(n * 100) / 100
/** Provedores que informam restrições (os demais só débitos). */
const REPORTS_RESTRICTIONS = new Set(['INFOSIMPLES', 'CONSULTA_DE_PLACA', 'CHECKTUDO'])

export async function requestVehicleQuery(vehicleId: string, tenantId: string | null, opts: { force?: boolean; ownerDoc?: string | null; uf?: string | null }, actor: Actor) {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, ...(tenantId ? { tenantId } : {}) }, select: { id: true, tenantId: true, unitId: true, plate: true, renavam: true, chassi: true, originEvaluationId: true, customerId: true, unit: { select: { state: true } } } })
  if (!v?.tenantId) throw new OpsError('Veículo não encontrado.', 404)
  if (!v.plate) throw new OpsError('Cadastre a placa do veículo para consultar.', 400)
  const conn = await activeConnection(v.tenantId, 'VEHICLE_DATA', v.unitId)
  const provider = vehicleDataProvider(conn.providerId)
  if (!conn.id || !provider) throw new OpsError('Conecte um provedor de consulta em Configurações › Operações.', 409, { action: 'settings' })

  const since = new Date(Date.now() - CACHE_MS)
  if (!opts.force) {
    const recent = await prisma.vehicleDataQuery.findFirst({ where: { vehicleId, status: { in: ['DONE', 'PARTIAL'] }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } })
    if (recent) return { query: recent, cached: true }
  }
  const running = await prisma.vehicleDataQuery.findFirst({ where: { vehicleId, status: 'PROCESSING', createdAt: { gte: new Date(Date.now() - INFLIGHT_MS) } } })
  if (running) return { query: running, cached: true }

  // Alguns provedores exigem o documento do proprietário: o informado, o da avaliação ou o do cliente de origem.
  const ownerDoc = (opts.ownerDoc
    ?? (v.originEvaluationId ? (await prisma.vehicleEvaluation.findUnique({ where: { id: v.originEvaluationId }, select: { ownerCpf: true } }))?.ownerCpf : null)
    ?? (v.customerId ? (await prisma.customer.findUnique({ where: { id: v.customerId }, select: { cpf: true } }))?.cpf : null)
    ?? '').replace(/\D/g, '') || null
  const uf = (opts.uf ?? v.unit?.state ?? null)?.toUpperCase() ?? null
  if (conn.providerId === 'CELCOIN') {
    if (!v.renavam) throw new OpsError('Cadastre o RENAVAM do veículo para consultar os débitos.', 400)
    if (!uf) throw new OpsError('Cadastre o estado (UF) da loja para consultar os débitos.', 400)
    if (!ownerDoc || (ownerDoc.length !== 11 && ownerDoc.length !== 14)) throw new OpsError('Informe o CPF ou CNPJ do dono que está no documento do carro.', 400, { need: 'ownerDoc' })
  }
  const q = await prisma.vehicleDataQuery.create({
    data: { tenantId: v.tenantId, vehicleId, plate: v.plate, renavam: v.renavam, chassi: v.chassi, uf, providerId: conn.providerId, connectionId: conn.id, kind: 'FULL', status: 'PROCESSING', requestedById: actor.id ?? null },
  })
  let res: VehicleDataResult
  try {
    res = await provider.consult({ tenantId: v.tenantId, unitId: v.unitId, credentials: conn.credentials, environment: conn.environment, connectionId: conn.id }, { plate: v.plate, renavam: v.renavam, chassi: v.chassi, uf, ownerDoc, reference: q.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha na consulta'
    const definitive = (err as { rejected?: boolean })?.rejected
    const done = await prisma.vehicleDataQuery.update({ where: { id: q.id }, data: { status: definitive ? 'ERROR' : 'PROCESSING', errorMessage: definitive ? msg.slice(0, 300) : null } })
    if (definitive) throw new OpsError(`O provedor recusou a consulta: ${msg}`, 422)
    return { query: done, cached: false }
  }
  await recordEvent({ tenantId: v.tenantId, vehicleId, type: 'VEHICLE_QUERY', title: `Consulta de débitos e restrições solicitada (${providerEntry('VEHICLE_DATA', conn.providerId)?.name ?? conn.providerId}).`, actor })
  const updated = await prisma.vehicleDataQuery.update({ where: { id: q.id }, data: { externalId: res.externalId ?? q.id } })
  if (res.state !== 'PROCESSING') return { query: await completeVehicleQuery(updated.id, res, actor), cached: false }
  return { query: updated, cached: false }
}

/** Grava o resultado, consolida restrições e libera a trava se for o caso. */
export async function completeVehicleQuery(queryId: string, res: VehicleDataResult, actor: Actor = SYSTEM_ACTOR) {
  const q = await prisma.vehicleDataQuery.findUnique({ where: { id: queryId } })
  if (!q || (q.status !== 'PROCESSING' && q.status !== 'PARTIAL')) return q
  if (res.state === 'PROCESSING') return q
  const status = res.state === 'DONE' ? 'DONE' : 'ERROR'
  const debtsTotal = r2(res.debts.reduce((s, d) => s + d.amount, 0))
  const blocking = res.restrictions.some((r) => r.blocking)
  const updated = await prisma.vehicleDataQuery.update({
    where: { id: q.id },
    data: {
      status, finishedAt: new Date(), debtsTotal, debtsCount: res.debts.length, restrictionsCount: res.restrictions.length, blocking,
      result: { debts: res.debts, restrictions: res.restrictions, message: res.message ?? null } as unknown as Prisma.InputJsonValue,
      errorMessage: status === 'ERROR' ? (res.message ?? 'Consulta não concluída.') : null,
    },
  })
  if (!q.vehicleId) return updated
  if (status === 'DONE') {
    if (REPORTS_RESTRICTIONS.has(q.providerId)) await syncProviderRestrictions(q.tenantId, q.vehicleId, q.providerId, res.restrictions, actor)
    const brl = debtsTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    await recordEvent({ tenantId: q.tenantId, vehicleId: q.vehicleId, type: 'VEHICLE_QUERY_DONE', origin: 'PROVIDER', providerId: q.providerId, actor,
      title: res.debts.length ? `Consulta concluída: ${res.debts.length} débito(s), total ${brl}${res.restrictions.length ? ` · ${res.restrictions.length} restrição(ões)` : ''}.` : res.restrictions.length ? `Consulta concluída: ${res.restrictions.length} restrição(ões).` : 'Consulta concluída: nada consta.' })
  } else {
    await recordEvent({ tenantId: q.tenantId, vehicleId: q.vehicleId, type: 'VEHICLE_QUERY_FAILED', origin: 'PROVIDER', providerId: q.providerId, actor, title: res.message ?? 'Não foi possível concluir a consulta.' })
  }
  return updated
}

async function syncProviderRestrictions(tenantId: string, vehicleId: string, providerId: string, found: NormalizedRestriction[], actor: Actor) {
  const ref = (r: NormalizedRestriction) => `${providerId}:${r.kind}:${(r.reference ?? r.description).slice(0, 80)}`
  const active = await prisma.vehicleRestriction.findMany({ where: { vehicleId, status: 'ACTIVE', source: 'PROVIDER' } })
  const keys = new Set(found.map(ref))
  for (const r of found) {
    if (active.some((a) => a.reference === ref(r))) continue
    await prisma.vehicleRestriction.create({ data: { tenantId, vehicleId, kind: r.kind, blocking: r.blocking, source: 'PROVIDER', description: r.description.slice(0, 500), institution: r.institution ?? null, reference: ref(r) } })
    await recordEvent({ tenantId, vehicleId, type: 'RESTRICTION_ADDED', origin: 'PROVIDER', providerId, title: `${restrictionKindText(r.kind)} encontrada na consulta${r.blocking ? ' (impede a venda)' : ''}.`, detail: r.description, actor })
  }
  for (const a of active) {
    if (!a.reference?.startsWith(`${providerId}:`) || keys.has(a.reference)) continue
    await prisma.vehicleRestriction.update({ where: { id: a.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolution: 'Não consta mais na consulta do provedor.' } })
    await recordEvent({ tenantId, vehicleId, type: 'RESTRICTION_RESOLVED', origin: 'PROVIDER', providerId, title: `${restrictionKindText(a.kind)} não consta mais na consulta.`, actor })
  }
  await refreshVehicleRestriction(vehicleId, actor)
}

/** Job: consulta o andamento das consultas pendentes; expira as sem resposta. */
export async function pollVehicleQueries(limit = 40) {
  const rows = await prisma.vehicleDataQuery.findMany({ where: { status: 'PROCESSING' }, orderBy: { createdAt: 'asc' }, take: limit })
  let done = 0
  for (const q of rows) {
    if (Date.now() - q.createdAt.getTime() > 48 * 3_600_000) {
      await completeVehicleQuery(q.id, { state: 'ERROR', debts: [], restrictions: [], message: 'O provedor não respondeu em 48 horas.' })
      done++
      continue
    }
    const provider = vehicleDataProvider(q.providerId)
    const conn = q.connectionId ? await connectionById(q.connectionId) : null
    if (!provider || !conn || !q.externalId) continue
    const res = await provider.status({ tenantId: q.tenantId, credentials: conn.credentials, environment: conn.environment, connectionId: conn.id }, q.externalId).catch(() => null)
    if (res && res.state !== 'PROCESSING') { await completeVehicleQuery(q.id, res); done++ }
  }
  return done
}

/** Resumo para a tela do veículo. */
export async function vehicleQuerySummary(vehicleId: string) {
  const last = await prisma.vehicleDataQuery.findFirst({ where: { vehicleId }, orderBy: { createdAt: 'desc' } })
  if (!last) return null
  const result = (last.result as { debts?: unknown[]; restrictions?: unknown[]; message?: string } | null) ?? {}
  return {
    id: last.id, status: last.status, providerId: last.providerId, providerName: providerEntry('VEHICLE_DATA', last.providerId)?.name ?? last.providerId,
    createdAt: last.createdAt, finishedAt: last.finishedAt, debtsTotal: last.debtsTotal != null ? Number(last.debtsTotal) : 0, debtsCount: last.debtsCount,
    restrictionsCount: last.restrictionsCount, blocking: last.blocking, debts: result.debts ?? [], restrictions: result.restrictions ?? [], message: result.message ?? last.errorMessage ?? null,
    stale: Date.now() - last.createdAt.getTime() > CACHE_MS,
  }
}
