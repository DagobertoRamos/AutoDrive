// =============================================================================
// Central de Publicações — worker da fila (independente da aba do navegador).
// Roda por: cron (/api/internal/publications/run), `after()` logo depois de
// um pedido, ou o script scripts/publications-worker.cjs (VM/local).
//
//   • reserva 1 tarefa por vez com FOR UPDATE SKIP LOCKED (vários workers ok)
//   • índice único parcial: no máximo 1 tarefa EXECUTANDO por publicação
//   • trava com prazo (lockedUntil): worker que morreu → tarefa volta à fila;
//     se a operação cria algo no canal, volta como "resultado desconhecido"
//     e a próxima execução RECONSULTA antes de criar de novo
//   • antes de publicar: tarefa antiga (geração menor) ou veículo vendido →
//     cancelada/bloqueada (nunca republica vendido)
//   • depois de cada operação: lê o canal para CONFIRMAR o estado
//   • falha num destino não afeta os outros (cada tarefa é isolada)
// =============================================================================

import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { channelSpec } from './channels'
import { payloadHash } from './content-core'
import { ConnectorError, DEFAULT_HINT, isConnectorError, nextRunAfterError, type ErrorKind } from './errors'
import { opFor, statusFromRemote, type DesiredState, type JobOp, type PubStatus, type RemoteState } from './states'
import { isPublishableStock } from './sale-rules-core'
import { validatePayload } from './validate-core'
import { getConnector } from './connectors'
import { createHttpClient, type HttpClient } from './connectors/http'
import type { ConnectorContext, MappingResolver, RemoteResult } from './connectors/types'
import { buildFor, enqueue, loadVehicle, logEvent, onVehicleStockChanged, readSecrets, sealSecrets, SYSTEM_ACTOR } from './service'
import { loadPublicationSettings } from './settings'
import { mediaUrlFor } from './media-token'
import { exactMatch, rankCandidates } from './mapping-core'

const LOCK_MS = 5 * 60_000
const VERIFY_DELAYS_MS = [60_000, 3 * 60_000, 10 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000]

type JobRow = { id: string; tenantId: string; publicationId: string; vehicleId: string; channel: string; op: string; attempts: number; maxAttempts: number; generation: number; outcomeUnknown: boolean; revisionHash: string | null }

export interface WorkerDeps { http?: HttpClient; now?: () => Date; origin?: string; workerId?: string }

function appOrigin(): string {
  return (process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

// ── Reserva / recuperação ─────────────────────────────────────────────────────

/** Tarefas presas (worker caiu no meio) voltam para a fila. */
export async function recoverStaleJobs(onlyTenantIds?: string[]): Promise<number> {
  const stale = await prisma.publicationJob.findMany({ where: { status: 'EXECUTANDO', lockedUntil: { lt: new Date() }, ...(onlyTenantIds?.length ? { tenantId: { in: onlyTenantIds } } : {}) }, select: { id: true, op: true } })
  for (const j of stale) {
    await prisma.publicationJob.update({
      where: { id: j.id },
      data: { status: 'PENDENTE', lockedBy: null, lockedUntil: null, runAt: new Date(), outcomeUnknown: j.op === 'PUBLICAR' ? true : undefined, lastError: 'Retomada após interrupção do processamento.' },
    }).catch(() => undefined)
  }
  return stale.length
}

export async function claimJob(workerId: string, onlyTenantIds?: string[]): Promise<JobRow | null> {
  // Colunas são timestamp SEM fuso gravadas em UTC pelo Prisma: comparar
  // sempre com now() em UTC (a sessão do banco pode estar em outro fuso).
  const lockMs = LOCK_MS
  try {
    const rows = onlyTenantIds?.length
      ? await prisma.$queryRaw<JobRow[]>`
      WITH c AS (
        SELECT j.id FROM "publication_jobs" j
        WHERE j.status = 'PENDENTE' AND j."runAt" <= (now() AT TIME ZONE 'UTC') AND j."tenantId" = ANY(${onlyTenantIds})
          AND NOT EXISTS (SELECT 1 FROM "publication_jobs" r WHERE r."publicationId" = j."publicationId" AND r.status = 'EXECUTANDO')
        ORDER BY j.priority ASC, j."runAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "publication_jobs" SET status = 'EXECUTANDO', "lockedBy" = ${workerId}, "lockedUntil" = (now() AT TIME ZONE 'UTC') + (${lockMs}::int * interval '1 millisecond'),
        attempts = attempts + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE id IN (SELECT id FROM c)
      RETURNING id, "tenantId", "publicationId", "vehicleId", channel, op, attempts, "maxAttempts", generation, "outcomeUnknown", "revisionHash"`
      : await prisma.$queryRaw<JobRow[]>`
      WITH c AS (
        SELECT j.id FROM "publication_jobs" j
        WHERE j.status = 'PENDENTE' AND j."runAt" <= (now() AT TIME ZONE 'UTC')
          AND NOT EXISTS (SELECT 1 FROM "publication_jobs" r WHERE r."publicationId" = j."publicationId" AND r.status = 'EXECUTANDO')
        ORDER BY j.priority ASC, j."runAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "publication_jobs" SET status = 'EXECUTANDO', "lockedBy" = ${workerId}, "lockedUntil" = (now() AT TIME ZONE 'UTC') + (${lockMs}::int * interval '1 millisecond'),
        attempts = attempts + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE id IN (SELECT id FROM c)
      RETURNING id, "tenantId", "publicationId", "vehicleId", channel, op, attempts, "maxAttempts", generation, "outcomeUnknown", "revisionHash"`
    return rows[0] ?? null
  } catch (e) {
    // Outro worker pegou uma tarefa da mesma publicação no mesmo instante (índice único parcial).
    if (String((e as Error)?.message ?? '').includes('publication_jobs_one_running_per_publication') || (e as { code?: string })?.code === 'P2010') return null
    throw e
  }
}

// ── Contexto do conector ──────────────────────────────────────────────────────

function mappingResolver(tenantId: string, channel: string): MappingResolver {
  return {
    async resolve(kind, sourceKey, sourceLabel, lookup, pick) {
      const row = await prisma.publicationMapping.findUnique({ where: { tenantId_channel_kind_sourceKey: { tenantId, channel, kind, sourceKey } } })
      if (row?.targetId && (row.status === 'CONFIRMADO' || row.status === 'AUTOMATICO')) return { id: row.targetId, label: row.targetLabel ?? '' }
      if (row && row.status === 'REVISAR') return null
      const candidates = await lookup()
      const choice = pick ? pick(candidates) : exactMatch(sourceLabel, candidates)
      await prisma.publicationMapping.upsert({
        where: { tenantId_channel_kind_sourceKey: { tenantId, channel, kind, sourceKey } },
        create: { tenantId, channel, kind, sourceKey, sourceLabel, targetId: choice?.id ?? null, targetLabel: choice?.label ?? null, status: choice ? 'AUTOMATICO' : 'REVISAR', candidates: rankCandidates(sourceLabel, candidates) as unknown as Prisma.InputJsonValue },
        update: { targetId: choice?.id ?? null, targetLabel: choice?.label ?? null, status: choice ? 'AUTOMATICO' : 'REVISAR', candidates: rankCandidates(sourceLabel, candidates) as unknown as Prisma.InputJsonValue },
      })
      return choice
    },
  }
}

export async function connectorContext(conn: { id: string; tenantId: string; channel: string; externalAccountId: string; environment: string; config: Prisma.JsonValue; secretsEncrypted: string | null }, deps: WorkerDeps): Promise<ConnectorContext> {
  const now = deps.now ?? (() => new Date())
  return {
    connection: { id: conn.id, tenantId: conn.tenantId, externalAccountId: conn.externalAccountId, environment: conn.environment === 'HOMOLOGACAO' ? 'HOMOLOGACAO' : 'PRODUCAO', config: (conn.config && typeof conn.config === 'object' && !Array.isArray(conn.config) ? conn.config : {}) as Record<string, unknown> },
    secrets: readSecrets(conn.secretsEncrypted),
    http: deps.http ?? createHttpClient(),
    mapping: mappingResolver(conn.tenantId, conn.channel),
    mediaUrl: (u) => mediaUrlFor(deps.origin ?? appOrigin(), conn.tenantId, u.startsWith('http') || u.startsWith('/') ? u : `/${u}`, { now: now() }),
    async saveSecrets(s, expiresAt) {
      await prisma.publicationConnection.update({ where: { id: conn.id }, data: { secretsEncrypted: sealSecrets(s), ...(expiresAt !== undefined ? { tokenExpiresAt: expiresAt } : {}) } })
    },
    now,
  }
}

// ── Execução ──────────────────────────────────────────────────────────────────

async function finishJob(id: string, status: 'CONCLUIDO' | 'FALHOU' | 'CANCELADO' | 'BLOQUEADO', data: { lastError?: string | null; lastErrorKind?: string | null; result?: unknown } = {}) {
  await prisma.publicationJob.update({ where: { id }, data: { status, finishedAt: new Date(), lockedBy: null, lockedUntil: null, lastError: data.lastError ?? null, lastErrorKind: data.lastErrorKind ?? null, result: data.result === undefined ? undefined : (data.result as Prisma.InputJsonValue) } })
}

async function requeue(id: string, runAt: Date, err: { message: string; kind: string }, outcomeUnknown?: boolean) {
  await prisma.publicationJob.update({ where: { id }, data: { status: 'PENDENTE', runAt, lockedBy: null, lockedUntil: null, lastError: err.message, lastErrorKind: err.kind, ...(outcomeUnknown ? { outcomeUnknown: true } : {}) } })
}

export interface JobOutcome { jobId: string; op: string; channel: string; result: 'OK' | 'REPETIR' | 'FALHOU' | 'CANCELADO' | 'BLOQUEADO' | 'MANUAL'; status?: string; message?: string }

export async function executeJob(job: JobRow, deps: WorkerDeps = {}): Promise<JobOutcome> {
  const now = (deps.now ?? (() => new Date()))()
  const out = (result: JobOutcome['result'], extra: Partial<JobOutcome> = {}): JobOutcome => ({ jobId: job.id, op: job.op, channel: job.channel, result, ...extra })
  const pub = await prisma.publication.findFirst({ where: { id: job.publicationId, tenantId: job.tenantId }, include: { connection: true } })
  if (!pub) { await finishJob(job.id, 'CANCELADO', { lastError: 'Publicação não existe mais.' }); return out('CANCELADO') }
  const op = job.op as JobOp
  const ev = (type: string, message: string, toStatus?: string | null, data?: unknown) => logEvent(prisma, { tenantId: pub.tenantId, publicationId: pub.id, vehicleId: pub.vehicleId, channel: pub.channel, type, message, fromStatus: pub.status, toStatus: toStatus ?? null, data, actor: SYSTEM_ACTOR })
  const makesLive = op === 'PUBLICAR' || op === 'ATUALIZAR' || op === 'RETOMAR'

  // 1) Tarefa velha? (a intenção mudou depois que ela foi criada)
  if (makesLive && (job.generation < pub.generation || pub.desiredState !== 'PUBLICADO')) {
    await finishJob(job.id, 'CANCELADO', { lastError: 'Tarefa antiga: a intenção da publicação mudou.' })
    return out('CANCELADO', { message: 'Tarefa antiga descartada.' })
  }

  // 2) Veículo vendido/indisponível nunca volta ao ar.
  const vehicle = await loadVehicle(pub.tenantId, pub.vehicleId)
  if (!vehicle) { await finishJob(job.id, 'CANCELADO', { lastError: 'Veículo excluído.' }); return out('CANCELADO') }
  if (makesLive && !isPublishableStock(vehicle.stockStatus, vehicle.active)) {
    await finishJob(job.id, 'BLOQUEADO', { lastError: `Veículo ${String(vehicle.stockStatus).toLowerCase()} — envio bloqueado.`, lastErrorKind: 'VENDIDO' })
    await ev('BLOQUEADA', `Envio bloqueado: veículo ${String(vehicle.stockStatus).toLowerCase().replace(/_/g, ' ')} no estoque.`)
    await onVehicleStockChanged(pub.tenantId, pub.vehicleId)
    return out('BLOQUEADO', { message: 'Veículo indisponível.' })
  }

  const spec = channelSpec(pub.channel)
  const connector = getConnector(pub.channel)
  if (!spec || !connector) { await finishJob(job.id, 'FALHOU', { lastError: 'Canal sem conector.' }); return out('FALHOU') }

  // 3) Conta.
  const conn = pub.connection
  if (!conn || conn.status === 'NAO_CONECTADO') {
    await finishJob(job.id, 'BLOQUEADO', { lastError: 'Conta desconectada.', lastErrorKind: 'AUTH' })
    await prisma.publication.update({ where: { id: pub.id }, data: { status: 'FALHA', lastError: 'Conta do canal desconectada.', lastErrorCode: 'AUTH', lastErrorHint: DEFAULT_HINT.AUTH } })
    return out('BLOQUEADO', { message: 'Conta desconectada.' })
  }
  if (conn.status === 'RECONECTAR') {
    await finishJob(job.id, 'BLOQUEADO', { lastError: 'Conta precisa ser reconectada.', lastErrorKind: 'AUTH' })
    return out('BLOQUEADO', { message: 'Reconectar conta.' })
  }
  if (conn.throttledUntil && conn.throttledUntil > now) {
    await prisma.publicationJob.update({ where: { id: job.id }, data: { status: 'PENDENTE', runAt: conn.throttledUntil, attempts: { decrement: 1 }, lockedBy: null, lockedUntil: null } })
    return out('REPETIR', { message: 'Aguardando limite do canal.' })
  }
  // Limite do SaaS por conta (além do limite do portal).
  const settings = await loadPublicationSettings(pub.tenantId)
  const recent = await prisma.publicationJob.count({ where: { channel: pub.channel, publication: { connectionId: conn.id }, finishedAt: { gte: new Date(now.getTime() - 60_000) }, status: { in: ['CONCLUIDO', 'FALHOU'] } } })
  if (recent >= settings.perConnectionPerMinute && pub.channel !== 'SITE') {
    await prisma.publicationJob.update({ where: { id: job.id }, data: { status: 'PENDENTE', runAt: new Date(now.getTime() + 60_000), attempts: { decrement: 1 }, lockedBy: null, lockedUntil: null } })
    return out('REPETIR', { message: 'Limite por minuto desta conta.' })
  }

  const ctx = await connectorContext(conn, deps)
  const ref = { vehicleId: pub.vehicleId, remoteId: pub.remoteId, externalRef: pub.externalRef, remoteUrl: pub.remoteUrl, pendingToken: pub.pendingToken }
  const payload = makesLive || op === 'PAUSAR' ? await buildFor(pub.tenantId, vehicle, pub.externalRef, pub.overrides) : null
  const hash = payload ? payloadHash(payload) : null

  await prisma.publication.update({ where: { id: pub.id }, data: { status: makesLive ? 'ENVIANDO' : pub.status } })

  try {
    let r: RemoteResult | null = null
    let manual: string | null = null
    if (makesLive && payload) {
      const issues = [...validatePayload(payload, spec), ...(connector.validate ? await connector.validate(payload, ctx) : [])]
      const blocking = issues.filter((i) => i.severity === 'error')
      if (blocking.length) throw new ConnectorError('VALIDATION', blocking.map((i) => i.message).join(' '), blocking[0].hint, { code: 'VALIDACAO_LOCAL', details: issues })
    }

    switch (op) {
      case 'PUBLICAR': {
        // Timeout/queda anterior: confere no canal ANTES de criar de novo.
        if ((job.outcomeUnknown || pub.remoteId) && connector.findByReference) {
          const found = await connector.findByReference(ref, payload, ctx)
          if (found) { r = found; await ev('RECONSULTA', 'Anúncio já existia no canal (envio anterior sem resposta): não foi duplicado.', null, { remoteId: found.remoteId }) }
        }
        if (!r) r = await connector.publish!(payload!, ctx)
        break
      }
      case 'ATUALIZAR':
        if (!connector.update || spec.capabilities.update !== 'SIM') { manual = 'Este canal não permite atualizar pela integração. Edite o anúncio no próprio canal.'; break }
        r = await connector.update(ref, payload!, ctx)
        break
      case 'RETOMAR':
        if (connector.resume && spec.capabilities.resume === 'SIM' && pub.confirmedState === 'PAUSADO') r = await connector.resume(ref, payload!, ctx)
        else r = await connector.publish!(payload!, ctx)
        break
      case 'PAUSAR':
        if (connector.pause && spec.capabilities.pause === 'SIM') r = await connector.pause(ref, ctx)
        else manual = `${spec.name} não permite pausar pela integração. O anúncio continua no ar: pause ou retire manualmente${pub.remoteUrl ? ` em ${pub.remoteUrl}` : ''}.`
        break
      case 'REMOVER':
        if (connector.remove && spec.capabilities.remove === 'SIM') r = await connector.remove(ref, pub.archiveReason === 'VENDIDO' ? 'VENDIDO' : pub.archiveReason === 'RETIRADO' ? 'RETIRADO' : 'MANUAL', ctx)
        else manual = `${spec.name} não permite remover pela integração. Remova manualmente${pub.remoteUrl ? `: ${pub.remoteUrl}` : ''}.`
        break
      case 'VERIFICAR':
        r = connector.get ? await connector.get(ref, ctx) : null
        break
    }

    if (manual) {
      await prisma.publication.update({ where: { id: pub.id }, data: { status: 'ACAO_MANUAL', manualAction: manual } })
      await finishJob(job.id, 'CONCLUIDO', { result: { manual } })
      await ev('ACAO_MANUAL', manual, 'ACAO_MANUAL')
      return out('MANUAL', { status: 'ACAO_MANUAL', message: manual })
    }
    if (!r) { await finishJob(job.id, 'CONCLUIDO'); return out('OK') }

    // Confirmação: lê o canal de novo (resposta de envio não é comprovação).
    let confirmed = r
    if (op !== 'VERIFICAR' && connector.get && r.state !== 'NAO_ENCONTRADO') {
      try {
        const g = await connector.get({ ...ref, remoteId: r.remoteId ?? ref.remoteId, remoteUrl: r.remoteUrl ?? ref.remoteUrl, pendingToken: r.pendingToken ?? ref.pendingToken }, ctx)
        confirmed = { ...r, ...g, message: g.message ?? r.message, data: { ...(r.data ?? {}), ...(g.data ?? {}) } }
      } catch (e) {
        // Conferência falhou: fica "em análise" e uma VERIFICAR tenta depois.
        confirmed = { ...r, state: r.state === 'REMOVIDO' ? 'EM_ANALISE' : r.state === 'PUBLICADO' ? 'EM_ANALISE' : r.state, message: `Enviado; conferência pendente (${(e as Error).message}).` }
      }
    }
    const final = await applyRemote(pub.id, confirmed, { hash: op === 'VERIFICAR' ? undefined : hash, now })
    await finishJob(job.id, 'CONCLUIDO', { result: { state: confirmed.state, remoteId: confirmed.remoteId ?? null, message: confirmed.message ?? null } })
    await ev(op === 'VERIFICAR' ? 'VERIFICADA' : `${op}_OK`, confirmed.message || `${labelOp(op)}: canal respondeu "${confirmed.state.toLowerCase().replace(/_/g, ' ')}".`, final.status, { remoteId: confirmed.remoteId ?? null, remoteStatus: confirmed.remoteStatus ?? null, ...(confirmed.data ?? {}) })
    await followUp(pub.id, final, job)
    return out('OK', { status: final.status })
  } catch (e) {
    return handleError(e, job, pub, ev, now)
  }
}

const labelOp = (op: JobOp) => ({ PUBLICAR: 'Publicar', ATUALIZAR: 'Atualizar', PAUSAR: 'Pausar', RETOMAR: 'Reativar', REMOVER: 'Retirar', VERIFICAR: 'Conferir' }[op])

/** Grava o estado confirmado e deriva a situação exibida. */
export async function applyRemote(publicationId: string, r: RemoteResult, opts: { hash?: string | null; now?: Date }) {
  const now = opts.now ?? new Date()
  const pub = (await prisma.publication.findUnique({ where: { id: publicationId } }))!
  const desired = pub.desiredState as DesiredState
  const status: PubStatus = statusFromRemote(r.state, desired)
  const removed = r.state === 'REMOVIDO' || r.state === 'NAO_ENCONTRADO'
  const data: Prisma.PublicationUpdateInput = {
    confirmedState: r.state, status, lastVerifiedAt: now, lastSyncAt: now,
    remoteId: r.remoteId ?? pub.remoteId, remoteUrl: r.remoteUrl ?? pub.remoteUrl, remoteStatus: r.remoteStatus ?? pub.remoteStatus,
    pendingToken: r.pendingToken === undefined ? pub.pendingToken : r.pendingToken,
    remoteData: (r.data ?? pub.remoteData ?? undefined) as Prisma.InputJsonValue | undefined,
    lastError: r.state === 'REJEITADO' ? r.message ?? 'Recusado pelo canal.' : status === 'FALHA' ? 'O anúncio não foi encontrado no canal.' : null,
    lastErrorCode: r.state === 'REJEITADO' ? 'REJEITADO' : status === 'FALHA' ? 'NAO_ENCONTRADO' : null,
    lastErrorHint: r.state === 'REJEITADO' ? DEFAULT_HINT.VALIDATION : status === 'FALHA' ? DEFAULT_HINT.NOT_FOUND : r.message && /mapeamento/i.test(r.message) ? r.message : null,
    manualAction: null, scheduledAt: null,
    ...(opts.hash && r.state !== 'REJEITADO' ? { sentRevisionHash: opts.hash } : {}),
    ...(r.state === 'PUBLICADO' && !pub.publishedAt ? { publishedAt: now } : {}),
    ...(removed && desired === 'REMOVIDO' ? { removedAt: now, ...(pub.archiveReason ? { archivedAt: now } : {}) } : {}),
  }
  return prisma.publication.update({ where: { id: publicationId }, data })
}

/** Depois de gravar: agenda conferência ou a próxima operação para chegar ao desejado. */
async function followUp(publicationId: string, pub: Awaited<ReturnType<typeof applyRemote>>, job: JobRow) {
  const confirmed = pub.confirmedState as RemoteState | null
  if (confirmed === 'EM_ANALISE') {
    const verifications = await prisma.publicationJob.count({ where: { publicationId, op: 'VERIFICAR', createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } } })
    const delay = VERIFY_DELAYS_MS[Math.min(verifications, VERIFY_DELAYS_MS.length - 1)]
    await prisma.$transaction(async (tx) => { await enqueue(tx, pub, 'VERIFICAR', { runAt: new Date(Date.now() + delay) }) })
    return
  }
  const next = opFor(confirmed, pub.desiredState as DesiredState, !!pub.remoteId || !!pub.pendingToken)
  if (next && next !== job.op) await prisma.$transaction(async (tx) => { await enqueue(tx, pub, next, { sold: pub.archiveReason === 'VENDIDO' }) })
}

async function handleError(e: unknown, job: JobRow, pub: { id: string; tenantId: string; connectionId: string | null; status: string; desiredState: string; remoteUrl: string | null; channel: string }, ev: (type: string, message: string, toStatus?: string | null, data?: unknown) => Promise<void>, now: Date): Promise<JobOutcome> {
  const ce: ConnectorError = isConnectorError(e) ? e : new ConnectorError('UNAVAILABLE', `Erro interno: ${(e as Error)?.message ?? 'desconhecido'}`)
  if (!isConnectorError(e)) console.error('[publications] erro inesperado', job.id, e)
  const kind: ErrorKind = ce.kind
  const hint = ce.hint ?? DEFAULT_HINT[kind]
  const base = { jobId: job.id, op: job.op, channel: job.channel }
  const setPub = (status: PubStatus | null, extra: Prisma.PublicationUpdateInput = {}) => prisma.publication.update({ where: { id: pub.id }, data: { ...(status ? { status } : {}), lastError: ce.message.slice(0, 900), lastErrorCode: ce.code ?? kind, lastErrorHint: hint, ...extra } })

  // Remover algo que já não existe = objetivo alcançado.
  if (kind === 'NOT_FOUND' && job.op === 'REMOVER') {
    const final = await applyRemote(pub.id, { state: 'NAO_ENCONTRADO' }, { now })
    await finishJob(job.id, 'CONCLUIDO', { result: { state: 'NAO_ENCONTRADO' } })
    await ev('REMOVER_OK', 'O anúncio já não existia no canal.', final.status)
    return { ...base, result: 'OK', status: final.status }
  }
  if (kind === 'AUTH') {
    if (pub.connectionId) await prisma.publicationConnection.update({ where: { id: pub.connectionId }, data: { status: 'RECONECTAR', lastError: ce.message.slice(0, 500) } })
    await finishJob(job.id, 'BLOQUEADO', { lastError: ce.message, lastErrorKind: 'AUTH' })
    await setPub(job.op === 'REMOVER' ? 'REMOCAO_PENDENTE' : 'FALHA')
    await ev('ERRO_AUTENTICACAO', `${ce.message} ${hint}`)
    return { ...base, result: 'BLOQUEADO', message: ce.message }
  }
  if (kind === 'RATE_LIMIT') {
    const until = new Date(now.getTime() + (ce.retryAfterMs ?? 60_000))
    if (pub.connectionId) await prisma.publicationConnection.update({ where: { id: pub.connectionId }, data: { throttledUntil: until } })
    const next = nextRunAfterError(kind, job.attempts, job.maxAttempts + 4, now, ce.retryAfterMs)
    if (next) { await requeue(job.id, next, { message: ce.message, kind }); return { ...base, result: 'REPETIR', message: ce.message } }
  }
  if (kind === 'TIMEOUT' || kind === 'UNAVAILABLE') {
    const next = nextRunAfterError(kind, job.attempts, job.maxAttempts, now)
    if (next) {
      await requeue(job.id, next, { message: ce.message, kind }, kind === 'TIMEOUT')
      if (kind === 'TIMEOUT') await ev('TIMEOUT', 'O canal não respondeu depois do envio. Vamos conferir no canal antes de reenviar.')
      return { ...base, result: 'REPETIR', message: ce.message }
    }
  }
  if ((kind === 'UNSUPPORTED' || kind === 'CONFIG') && job.op === 'REMOVER') {
    const msg = `${ce.message} ${hint}${pub.remoteUrl ? ` Link: ${pub.remoteUrl}` : ''}`
    await finishJob(job.id, 'FALHOU', { lastError: ce.message, lastErrorKind: kind })
    await setPub('ACAO_MANUAL', { manualAction: msg })
    await ev('ACAO_MANUAL', msg, 'ACAO_MANUAL')
    return { ...base, result: 'MANUAL', message: msg }
  }
  const status: PubStatus = kind === 'VALIDATION' ? (ce.code === 'VALIDACAO_LOCAL' ? 'FALHA' : 'REJEITADO') : job.op === 'REMOVER' ? 'REMOCAO_PENDENTE' : 'FALHA'
  await finishJob(job.id, 'FALHOU', { lastError: ce.message, lastErrorKind: kind, result: ce.opts.details ? { details: ce.opts.details } : undefined })
  await setPub(job.op === 'VERIFICAR' ? null : status)
  await ev(kind === 'QUOTA' ? 'COTA_ESGOTADA' : 'FALHA', `${ce.message} — ${hint}`, job.op === 'VERIFICAR' ? null : status, ce.opts.details ? { detalhes: ce.opts.details } : undefined)
  return { ...base, result: 'FALHOU', message: ce.message }
}

// ── Laço ──────────────────────────────────────────────────────────────────────

export async function runWorker(opts: { maxJobs?: number; deadlineMs?: number; onlyTenantIds?: string[] } & WorkerDeps = {}): Promise<{ recovered: number; processed: JobOutcome[] }> {
  const workerId = opts.workerId ?? `w-${randomUUID().slice(0, 8)}`
  const deadline = Date.now() + (opts.deadlineMs ?? 50_000)
  const recovered = await recoverStaleJobs(opts.onlyTenantIds)
  const processed: JobOutcome[] = []
  while (processed.length < (opts.maxJobs ?? 25) && Date.now() < deadline) {
    const job = await claimJob(workerId, opts.onlyTenantIds)
    if (!job) break
    try {
      processed.push(await executeJob(job, opts))
    } catch (e) {
      console.error('[publications] falha no worker', job.id, e)
      await requeue(job.id, new Date(Date.now() + 60_000), { message: `Falha interna: ${(e as Error).message}`, kind: 'UNAVAILABLE' }).catch(() => undefined)
      processed.push({ jobId: job.id, op: job.op, channel: job.channel, result: 'REPETIR', message: 'Falha interna; repetindo.' })
    }
  }
  return { recovered, processed }
}
