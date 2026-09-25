// =============================================================================
// Central de Publicações — serviço (banco). Tudo filtrado por tenantId.
//
// Garantias:
//   • intenção + tarefa gravadas na MESMA transação (publicação nunca fica
//     "na fila" sem tarefa, nem tarefa sem publicação);
//   • linha da publicação travada (FOR UPDATE) → clique duplo e requisições
//     simultâneas não criam tarefas repetidas;
//   • `generation` sobe a cada mudança de intenção → tarefa antiga não
//     republica veículo vendido;
//   • venda tem prioridade 0 na fila e cancela agendamentos.
// =============================================================================

import { Prisma } from '@prisma/client'
import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/crypto'
import { channelSpec, isPublishable, type ChannelSpec } from './channels'
import { buildPayload, payloadHash, shortRef, type ContentSource, type ListingPayload, type VehicleFacts } from './content-core'
import { priorityOf, statusWhileQueued, type DesiredState, type JobOp, type PubStatus } from './states'
import { isPublishableStock, saleAction, type SaleReason } from './sale-rules-core'
import { loadPublicationSettings, type PublicationSettings } from './settings'
import { validatePayload, type Issue } from './validate-core'
import { getConnector } from './connectors'

type Tx = Prisma.TransactionClient
export interface Actor { id: string | null; name: string | null; role?: string | null }
export const SYSTEM_ACTOR: Actor = { id: null, name: 'Sistema' }

const json = (v: unknown) => (v === undefined ? undefined : (v as Prisma.InputJsonValue))

// ── Eventos (histórico/auditoria) ─────────────────────────────────────────────

export async function logEvent(db: Tx | typeof prisma, e: {
  tenantId: string; publicationId?: string | null; vehicleId?: string | null; channel?: string | null
  type: string; message: string; fromStatus?: string | null; toStatus?: string | null; data?: unknown; actor?: Actor
}) {
  await db.publicationEvent.create({
    data: {
      tenantId: e.tenantId, publicationId: e.publicationId ?? null, vehicleId: e.vehicleId ?? null, channel: e.channel ?? null,
      type: e.type, message: e.message.slice(0, 1000), fromStatus: e.fromStatus ?? null, toStatus: e.toStatus ?? null,
      data: json(e.data ?? undefined), actorId: e.actor?.id ?? null, actorName: e.actor?.name ?? null,
    },
  })
}

// ── Conexões ──────────────────────────────────────────────────────────────────

/** O site próprio não precisa conectar: a conexão existe sempre. */
export async function ensureSiteConnection(tenantId: string) {
  return prisma.publicationConnection.upsert({
    where: { tenantId_channel_externalAccountId: { tenantId, channel: 'SITE', externalAccountId: 'site' } },
    create: { tenantId, channel: 'SITE', externalAccountId: 'site', label: 'Site da loja', status: 'CONECTADO', connectedAt: new Date() },
    update: {},
  })
}

export function readSecrets(secretsEncrypted: string | null | undefined): Record<string, string> {
  if (!secretsEncrypted) return {}
  try { return JSON.parse(decrypt(secretsEncrypted) || '{}') as Record<string, string> } catch { return {} }
}

export function sealSecrets(secrets: Record<string, string>): string {
  return encrypt(JSON.stringify(secrets))
}

export function maskHint(v: string): string {
  const s = String(v ?? '')
  if (s.includes('@')) { const [u, d] = s.split('@'); return `${u.slice(0, 2)}•••@${d}` }
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`
}

// ── Veículo → conteúdo ────────────────────────────────────────────────────────

const vehicleSelect = {
  id: true, tenantId: true, unitId: true, plate: true, chassi: true, brand: true, model: true, version: true, year: true, modelYear: true, km: true,
  color: true, fuel: true, transmission: true, doors: true, bodyType: true, engine: true, salePrice: true, promoPrice: true, isPromo: true,
  promoStartsAt: true, promoEndsAt: true, conditionType: true, active: true, stockStatus: true, mainPhotoUrl: true,
  photos: { select: { url: true }, orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }] },
  siteListing: { select: { title: true, description: true, options: true, hidden: true, photosStatus: true, originalPhotos: true } },
} satisfies Prisma.VehicleSelect

export type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof vehicleSelect }>

export async function loadVehicle(tenantId: string, vehicleId: string): Promise<VehicleRow | null> {
  return prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: vehicleSelect })
}

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Number(d))

export function factsOf(v: VehicleRow): VehicleFacts {
  return {
    id: v.id, unitId: v.unitId, plate: v.plate, chassi: v.chassi, brand: v.brand, model: v.model, version: v.version, year: v.year,
    modelYear: v.modelYear, km: v.km, color: v.color, fuel: v.fuel, transmission: v.transmission, doors: v.doors, bodyType: v.bodyType,
    engine: v.engine, salePrice: num(v.salePrice), promoPrice: num(v.promoPrice), isPromo: v.isPromo, promoStartsAt: v.promoStartsAt,
    promoEndsAt: v.promoEndsAt, conditionType: v.conditionType,
  }
}

export function draftSource(d: { title: string | null; description: string | null; conditions: string | null; price: Prisma.Decimal | null; photos: Prisma.JsonValue } | null): ContentSource | null {
  if (!d) return null
  return { title: d.title, description: d.description, conditions: d.conditions, price: num(d.price), photos: Array.isArray(d.photos) ? (d.photos as unknown[]).map((p) => (typeof p === 'string' ? p : (p as { url?: string })?.url ?? '')).filter(Boolean) : null }
}

export function overridesSource(o: Prisma.JsonValue | null | undefined): ContentSource | null {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const x = o as Record<string, unknown>
  return {
    title: typeof x.title === 'string' ? x.title : null, description: typeof x.description === 'string' ? x.description : null,
    conditions: typeof x.conditions === 'string' ? x.conditions : null, price: typeof x.price === 'number' ? x.price : null,
    photos: Array.isArray(x.photos) ? x.photos.filter((p): p is string => typeof p === 'string') : null,
  }
}

export async function tenantLocation(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, nomeFantasia: true, zipCode: true, city: true, state: true, logradouro: true, numero: true, bairro: true } })
  return {
    storeName: t?.nomeFantasia || t?.name || '',
    location: { zip: t?.zipCode ?? null, city: t?.city ?? null, state: t?.state ?? null, address: t?.logradouro ? `${t.logradouro}${t.numero ? `, ${t.numero}` : ''}` : null, neighborhood: t?.bairro ?? null },
  }
}

export interface PayloadContext { settings: PublicationSettings; loc: Awaited<ReturnType<typeof tenantLocation>> }

export async function payloadContext(tenantId: string): Promise<PayloadContext> {
  const [settings, loc] = await Promise.all([loadPublicationSettings(tenantId), tenantLocation(tenantId)])
  return { settings, loc }
}

export async function buildFor(tenantId: string, v: VehicleRow, externalRef: string, overrides: Prisma.JsonValue | null, ctx?: PayloadContext): Promise<ListingPayload> {
  const c = ctx ?? await payloadContext(tenantId)
  const draft = await prisma.publicationDraft.findUnique({ where: { vehicleId: v.id } })
  // Só fotos que ainda existem (galeria ou originais preservadas) — foto
  // apagada depois da aprovação não vira link quebrado no canal.
  const allowed = new Set([...v.photos.map((p) => p.url), ...(Array.isArray(v.siteListing?.originalPhotos) ? (v.siteListing!.originalPhotos as unknown[]).filter((x): x is string => typeof x === 'string') : [])])
  const src = draftSource(draft)
  const ov = overridesSource(overrides)
  if (src?.photos) src.photos = src.photos.filter((u) => allowed.has(u))
  if (ov?.photos) ov.photos = ov.photos.filter((u) => allowed.has(u))
  return buildPayload({
    reference: externalRef, vehicle: factsOf(v), siteListing: v.siteListing, gallery: v.photos.map((p) => p.url),
    draft: src, overrides: ov, contacts: c.settings.contacts, location: c.loc.location, storeName: c.loc.storeName,
  })
}

// ── Pré-validação (prévia) ─────────────────────────────────────────────────────

export interface PreviewItem {
  vehicleId: string; connectionId: string; channel: string; channelName: string
  payload: Pick<ListingPayload, 'title' | 'description' | 'caption' | 'price' | 'oldPrice' | 'photos'>
  issues: Issue[]; blocked: boolean
}

export async function previewTargets(tenantId: string, vehicleIds: string[], connectionIds: string[], overridesByTarget: Record<string, unknown> = {}): Promise<PreviewItem[]> {
  const ctx = await payloadContext(tenantId)
  const conns = await prisma.publicationConnection.findMany({ where: { tenantId, id: { in: connectionIds } } })
  const approved = new Set((await prisma.publicationDraft.findMany({ where: { tenantId, vehicleId: { in: vehicleIds }, mediaRevisionId: { not: null } }, select: { vehicleId: true } })).map((d) => d.vehicleId))
  const out: PreviewItem[] = []
  for (const vehicleId of vehicleIds) {
    const v = await loadVehicle(tenantId, vehicleId)
    if (!v) continue
    for (const conn of conns) {
      const spec = channelSpec(conn.channel)
      if (!spec) continue
      const ov = (overridesByTarget[`${vehicleId}:${conn.id}`] ?? null) as Prisma.JsonValue
      const p = await buildFor(tenantId, v, 'previa', ov, ctx)
      const issues = validatePayload(p, spec)
      if (!approved.has(vehicleId) && spec.id !== 'SITE') issues.unshift({ field: 'media', severity: 'error', message: 'Fotos ainda não aprovadas para os canais.', hint: 'Na etapa Fotos, confira capa e ordem e clique em "Aprovar fotos" (gestor).' })
      if (!isPublishableStock(v.stockStatus, v.active)) issues.unshift({ field: 'stock', severity: 'error', message: `Veículo ${String(v.stockStatus ?? '').toLowerCase().replace(/_/g, ' ')} no estoque — não pode ser anunciado.`, hint: 'Só veículos Disponíveis ou Em promoção vão para os canais.' })
      if (conn.status !== 'CONECTADO') issues.unshift({ field: 'connection', severity: 'error', message: `Conta ${conn.label} ${conn.status === 'RECONECTAR' ? 'precisa ser reconectada' : 'não está conectada'}.`, hint: 'Resolva em Marketing › Canais conectados.' })
      out.push({
        vehicleId, connectionId: conn.id, channel: conn.channel, channelName: `${spec.name} · ${conn.label}`,
        payload: { title: p.title, description: p.description, caption: p.caption, price: p.price, oldPrice: p.oldPrice, photos: p.photos.slice(0, spec.media.max) },
        issues, blocked: issues.some((i) => i.severity === 'error'),
      })
    }
  }
  return out
}

// ── Enfileirar (dentro da transação) ──────────────────────────────────────────

async function lockPublication(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "publications" WHERE id = ${id} FOR UPDATE`
}

/**
 * Cria a tarefa da operação, se ainda não houver uma igual pendente.
 * Chave de idempotência = publicação + operação + geração (+ pedido do cliente).
 */
export async function enqueue(tx: Tx, pub: { id: string; tenantId: string; vehicleId: string; channel: string; generation: number }, op: JobOp, opts: { runAt?: Date; sold?: boolean; actorId?: string | null; requestKey?: string; revisionHash?: string | null } = {}) {
  const existing = await tx.publicationJob.findFirst({ where: { publicationId: pub.id, op, status: { in: ['PENDENTE', 'EXECUTANDO'] }, generation: pub.generation } })
  if (existing) return { job: existing, created: false }
  const key = opts.requestKey ? `req:${opts.requestKey}:${pub.id}:${op}` : `${pub.id}:${op}:g${pub.generation}:${opts.runAt ? opts.runAt.getTime() : 'now'}`
  const dup = await tx.publicationJob.findUnique({ where: { idempotencyKey: key } })
  if (dup) return { job: dup, created: false }
  const job = await tx.publicationJob.create({
    data: {
      tenantId: pub.tenantId, publicationId: pub.id, vehicleId: pub.vehicleId, channel: pub.channel, op,
      priority: priorityOf(op, opts.sold), runAt: opts.runAt ?? new Date(), idempotencyKey: key, generation: pub.generation,
      revisionHash: opts.revisionHash ?? null, createdById: opts.actorId ?? null, maxAttempts: op === 'VERIFICAR' ? 8 : 6,
    },
  })
  return { job, created: true }
}

/** Cancela tarefas pendentes que ficaram sem sentido com a nova intenção. */
async function cancelPending(tx: Tx, publicationId: string, ops: JobOp[] | 'ALL', reason: string) {
  await tx.publicationJob.updateMany({
    where: { publicationId, status: 'PENDENTE', ...(ops === 'ALL' ? {} : { op: { in: ops } }) },
    data: { status: 'CANCELADO', lastError: reason, finishedAt: new Date() },
  })
}

// ── Criar / publicar / agendar ────────────────────────────────────────────────

export interface TargetInput { vehicleId: string; connectionId: string; campaignKey?: string; overrides?: Record<string, unknown> | null }
export interface CreateResult { vehicleId: string; connectionId: string; channel: string; publicationId?: string; status: 'ENFILEIRADO' | 'AGENDADO' | 'JA_NA_FILA' | 'RASCUNHO' | 'BLOQUEADO' | 'ERRO'; message: string; issues?: Issue[] }

export async function createPublications(tenantId: string, targets: TargetInput[], opts: { mode: 'AGORA' | 'AGENDAR' | 'RASCUNHO'; scheduledAt?: Date | null; actor: Actor; requestKey?: string }): Promise<CreateResult[]> {
  const results: CreateResult[] = []
  const conns = new Map((await prisma.publicationConnection.findMany({ where: { tenantId, id: { in: [...new Set(targets.map((t) => t.connectionId))] } } })).map((c) => [c.id, c]))
  const preview = await previewTargets(tenantId, [...new Set(targets.map((t) => t.vehicleId))], [...conns.keys()], Object.fromEntries(targets.map((t) => [`${t.vehicleId}:${t.connectionId}`, t.overrides ?? null])))
  for (const t of targets) {
    const conn = conns.get(t.connectionId)
    const base = { vehicleId: t.vehicleId, connectionId: t.connectionId, channel: conn?.channel ?? '?' }
    const spec = conn ? channelSpec(conn.channel) : undefined
    if (!conn || !spec) { results.push({ ...base, status: 'ERRO', message: 'Conta de destino não encontrada nesta loja.' }); continue }
    if (!isPublishable(spec) && spec.mechanism !== 'MANUAL') { results.push({ ...base, status: 'BLOQUEADO', message: `${spec.name} ainda não tem envio automático (${spec.devStatus.toLowerCase().replace(/_/g, ' ')}).` }); continue }
    const pv = preview.find((p) => p.vehicleId === t.vehicleId && p.connectionId === t.connectionId)
    if (!pv) { results.push({ ...base, status: 'ERRO', message: 'Veículo não encontrado nesta loja.' }); continue }
    const blocked = pv.blocked && opts.mode !== 'RASCUNHO'
    const campaignKey = spec.campaigns ? (t.campaignKey?.trim().slice(0, 60) || 'principal') : 'principal'
    try {
      const r = await prisma.$transaction(async (tx) => {
        const where = { tenantId_vehicleId_channel_connectionKey_campaignKey: { tenantId, vehicleId: t.vehicleId, channel: conn.channel, connectionKey: conn.id, campaignKey } }
        let pub = await tx.publication.findUnique({ where })
        if (!pub) {
          const v = await tx.vehicle.findFirst({ where: { id: t.vehicleId, tenantId }, select: { unitId: true } })
          pub = await tx.publication.create({
            data: {
              tenantId, unitId: v?.unitId ?? null, vehicleId: t.vehicleId, channel: conn.channel, connectionId: conn.id, connectionKey: conn.id, campaignKey,
              externalRef: shortRef(`${tenantId}:${t.vehicleId}:${conn.id}:${campaignKey}`), status: 'RASCUNHO', desiredState: 'PUBLICADO',
              manual: spec.mechanism === 'MANUAL', overrides: json(t.overrides ?? undefined), createdById: opts.actor.id,
            },
          })
          await logEvent(tx, { tenantId, publicationId: pub.id, vehicleId: t.vehicleId, channel: conn.channel, type: 'CRIADA', message: `Publicação criada para ${spec.name} (${conn.label}).`, toStatus: 'RASCUNHO', actor: opts.actor })
        }
        await lockPublication(tx, pub.id)
        pub = (await tx.publication.findUnique({ where: { id: pub.id } }))!
        if (t.overrides) pub = await tx.publication.update({ where: { id: pub.id }, data: { overrides: json(t.overrides), updatedById: opts.actor.id } })
        if (opts.mode === 'RASCUNHO' || blocked) {
          const status: PubStatus = blocked ? 'RASCUNHO' : pv.blocked ? 'RASCUNHO' : 'PRONTO'
          if (!pub.remoteId) await tx.publication.update({ where: { id: pub.id }, data: { status, lastError: blocked ? pv.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ') : null, lastErrorHint: blocked ? pv.issues.find((i) => i.severity === 'error')?.hint ?? null : null } })
          return { pub, status: blocked ? 'BLOQUEADO' as const : 'RASCUNHO' as const, message: blocked ? 'Pendências impedem o envio.' : 'Rascunho salvo.' }
        }
        if (spec.mechanism === 'MANUAL') {
          const upd = await tx.publication.update({ where: { id: pub.id }, data: { status: 'ACAO_MANUAL', desiredState: 'PUBLICADO', manualAction: 'Baixe fotos e texto e publique na plataforma escolhida. Depois cole o link aqui.', archivedAt: null, archiveReason: null } })
          await logEvent(tx, { tenantId, publicationId: pub.id, vehicleId: t.vehicleId, channel: conn.channel, type: 'MANUAL', message: 'Publicação manual preparada (fotos e texto para exportar).', fromStatus: pub.status, toStatus: 'ACAO_MANUAL', actor: opts.actor })
          return { pub: upd, status: 'ENFILEIRADO' as const, message: 'Pronto para publicação manual.' }
        }
        const alreadyLive = !!pub.remoteId && (pub.confirmedState === 'PUBLICADO' || pub.confirmedState === 'EM_ANALISE' || pub.confirmedState === 'PAUSADO')
        const op: JobOp = alreadyLive ? (pub.confirmedState === 'PAUSADO' ? 'RETOMAR' : 'ATUALIZAR') : 'PUBLICAR'
        const scheduled = opts.mode === 'AGENDAR' && opts.scheduledAt ? opts.scheduledAt : null
        const intentChanged = pub.desiredState !== 'PUBLICADO' || !!pub.archivedAt
        const gen = intentChanged || scheduled ? pub.generation + 1 : pub.generation
        if (gen !== pub.generation) await cancelPending(tx, pub.id, 'ALL', 'Substituída por novo pedido de publicação.')
        const status: PubStatus = scheduled ? 'AGENDADO' : statusWhileQueued(op)
        const upd = await tx.publication.update({
          where: { id: pub.id },
          data: { desiredState: 'PUBLICADO', generation: gen, status, scheduledAt: scheduled, archivedAt: null, archiveReason: null, pausedReason: null, lastError: null, lastErrorCode: null, lastErrorHint: null, manualAction: null, updatedById: opts.actor.id },
        })
        const { created } = await enqueue(tx, upd, op, { runAt: scheduled ?? undefined, actorId: opts.actor.id, requestKey: opts.requestKey })
        if (created) {
          await logEvent(tx, { tenantId, publicationId: pub.id, vehicleId: t.vehicleId, channel: conn.channel, type: scheduled ? 'AGENDADA' : 'ENFILEIRADA', message: scheduled ? `Agendada para ${scheduled.toISOString()}.` : `${op === 'PUBLICAR' ? 'Publicação' : 'Atualização'} enviada para a fila.`, fromStatus: pub.status, toStatus: status, actor: opts.actor })
        }
        return { pub: upd, status: created ? (scheduled ? 'AGENDADO' as const : 'ENFILEIRADO' as const) : 'JA_NA_FILA' as const, message: created ? (scheduled ? 'Agendado.' : 'Na fila.') : 'Já estava na fila (pedido repetido ignorado).' }
      })
      results.push({ ...base, publicationId: r.pub.id, status: r.status, message: r.message, issues: pv.issues.length ? pv.issues : undefined })
    } catch (e) {
      // Corrida na criação (outro clique criou a mesma publicação): trata como repetido.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') { results.push({ ...base, status: 'JA_NA_FILA', message: 'Pedido repetido ignorado.' }); continue }
      console.error('[publications] createPublications', e)
      results.push({ ...base, status: 'ERRO', message: 'Não foi possível registrar a publicação. Tente de novo.' })
    }
  }
  return results
}

// ── Mudar intenção (pausar, retomar, retirar) ─────────────────────────────────

export type Intent = 'PAUSAR' | 'RETOMAR' | 'RETIRAR' | 'VERIFICAR' | 'SINCRONIZAR' | 'CANCELAR_AGENDAMENTO'

export async function applyIntent(tenantId: string, publicationId: string, intent: Intent, actor: Actor, opts: { reason?: SaleReason | 'MANUAL'; archive?: 'VENDIDO' | 'RETIRADO' | null; sold?: boolean } = {}): Promise<{ ok: boolean; message: string; status?: string }> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.publication.findFirst({ where: { id: publicationId, tenantId } })
    if (!found) return { ok: false, message: 'Publicação não encontrada nesta loja.' }
    await lockPublication(tx, found.id)
    const pub = (await tx.publication.findUnique({ where: { id: found.id } }))!
    const alreadyGone = pub.confirmedState === 'REMOVIDO' || pub.confirmedState === 'NAO_ENCONTRADO'
    const hasRemote = !alreadyGone && (!!pub.remoteId || pub.confirmedState === 'PUBLICADO' || pub.confirmedState === 'PAUSADO' || pub.confirmedState === 'EM_ANALISE' || !!pub.pendingToken)
    const ev = (type: string, message: string, toStatus?: string) => logEvent(tx, { tenantId, publicationId: pub.id, vehicleId: pub.vehicleId, channel: pub.channel, type, message, fromStatus: pub.status, toStatus: toStatus ?? null, actor, data: opts.reason ? { motivo: opts.reason } : undefined })

    if (intent === 'CANCELAR_AGENDAMENTO') {
      if (pub.status !== 'AGENDADO') return { ok: false, message: 'Esta publicação não está agendada.' }
      await cancelPending(tx, pub.id, 'ALL', 'Agendamento cancelado.')
      const st: PubStatus = hasRemote ? (pub.confirmedState === 'PUBLICADO' ? 'PUBLICADO' : 'EM_ANALISE') : 'PRONTO'
      await tx.publication.update({ where: { id: pub.id }, data: { status: st, scheduledAt: null, generation: pub.generation + 1 } })
      await ev('AGENDAMENTO_CANCELADO', 'Agendamento cancelado.', st)
      return { ok: true, message: 'Agendamento cancelado.', status: st }
    }

    if (intent === 'VERIFICAR' || intent === 'SINCRONIZAR') {
      if (!hasRemote) return { ok: false, message: 'Ainda não há anúncio no canal para conferir.' }
      const op: JobOp = intent === 'VERIFICAR' ? 'VERIFICAR' : 'ATUALIZAR'
      if (op === 'ATUALIZAR' && pub.desiredState !== 'PUBLICADO') return { ok: false, message: 'Só anúncios ativos são sincronizados.' }
      const { created } = await enqueue(tx, pub, op, { actorId: actor.id })
      if (created) await ev(op, intent === 'VERIFICAR' ? 'Conferência solicitada.' : 'Sincronização solicitada.')
      return { ok: true, message: created ? 'Na fila.' : 'Já estava na fila.' }
    }

    const desired: DesiredState = intent === 'PAUSAR' ? 'PAUSADO' : intent === 'RETIRAR' ? 'REMOVIDO' : 'PUBLICADO'
    if (intent === 'RETOMAR') {
      const v = await tx.vehicle.findFirst({ where: { id: pub.vehicleId, tenantId }, select: { stockStatus: true, active: true } })
      if (!isPublishableStock(v?.stockStatus, v?.active ?? false)) return { ok: false, message: 'O veículo não está disponível no estoque; não pode voltar ao ar.' }
    }
    if (pub.desiredState === desired && !(intent === 'RETIRAR' && !pub.archivedAt && opts.archive)) return { ok: true, message: 'Nada a mudar.' }
    const gen = pub.generation + 1
    await cancelPending(tx, pub.id, 'ALL', `Substituída: ${intent.toLowerCase()}.`)

    // Fora do canal e pedido de voltar ao ar (ex.: venda cancelada depois de
    // retirar): publica de novo.
    if (!hasRemote && desired === 'PUBLICADO') {
      const upd = await tx.publication.update({ where: { id: pub.id }, data: { desiredState: 'PUBLICADO', generation: gen, status: 'NA_FILA', pausedReason: null, archivedAt: null, archiveReason: null, updatedById: actor.id } })
      await enqueue(tx, upd, 'PUBLICAR', { actorId: actor.id })
      await ev(intent, 'Nova publicação enviada para a fila.', 'NA_FILA')
      return { ok: true, message: 'Na fila.', status: 'NA_FILA' }
    }

    // Nunca chegou ao canal (ou já saiu): resolve localmente, sem tarefa.
    if (!hasRemote) {
      const st: PubStatus = desired === 'REMOVIDO' ? 'REMOVIDO' : desired === 'PAUSADO' ? 'PAUSADO' : 'PRONTO'
      await tx.publication.update({
        where: { id: pub.id },
        data: { desiredState: desired, generation: gen, status: st, scheduledAt: null, pausedReason: desired === 'PAUSADO' ? opts.reason ?? 'MANUAL' : null, ...(desired === 'REMOVIDO' ? { removedAt: new Date(), archivedAt: opts.archive ? new Date() : null, archiveReason: opts.archive ?? null } : {}) },
      })
      await ev(intent, desired === 'REMOVIDO' ? `Encerrada${opts.archive ? ` e arquivada como ${opts.archive === 'VENDIDO' ? 'Vendido' : 'Retirado'}` : ''} (não estava no canal).` : 'Atualizada (não estava no canal).', st)
      return { ok: true, message: 'Feito.', status: st }
    }

    const op: JobOp = intent === 'PAUSAR' ? 'PAUSAR' : intent === 'RETIRAR' ? 'REMOVER' : pub.confirmedState === 'PAUSADO' ? 'RETOMAR' : pub.confirmedState === 'REMOVIDO' ? 'PUBLICAR' : 'RETOMAR'
    const st = statusWhileQueued(op)
    const upd = await tx.publication.update({
      where: { id: pub.id },
      data: {
        desiredState: desired, generation: gen, status: st, scheduledAt: null,
        pausedReason: desired === 'PAUSADO' ? opts.reason ?? 'MANUAL' : desired === 'PUBLICADO' ? null : pub.pausedReason,
        archiveReason: desired === 'REMOVIDO' ? opts.archive ?? pub.archiveReason : null, archivedAt: desired === 'REMOVIDO' ? pub.archivedAt : null, updatedById: actor.id,
      },
    })
    await enqueue(tx, upd, op, { sold: opts.sold, actorId: actor.id })
    await ev(intent, `${intent === 'RETIRAR' ? 'Retirada' : intent === 'PAUSAR' ? 'Pausa' : 'Reativação'} enviada para a fila${opts.reason && opts.reason !== 'MANUAL' ? ` (${opts.reason.toLowerCase().replace(/_/g, ' ')})` : ''}.`, st)
    return { ok: true, message: 'Na fila.', status: st }
  })
}

// ── Venda × anúncios ──────────────────────────────────────────────────────────

/**
 * Chamado quando o estoque do veículo muda (negociação aberta/aprovada/
 * finalizada/cancelada, baixa, importação). Idempotente: pode ser chamado
 * várias vezes (a reconciliação chama de novo por segurança).
 */
export async function onVehicleStockChanged(tenantId: string, vehicleId: string, actor: Actor = SYSTEM_ACTOR): Promise<{ action: string; affected: number }> {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { stockStatus: true, active: true } })
  if (!v) return { action: 'NONE', affected: 0 }
  const settings = await loadPublicationSettings(tenantId)
  const pubs = await prisma.publication.findMany({ where: { tenantId, vehicleId, archivedAt: null } })
  if (!pubs.length) return { action: 'NONE', affected: 0 }
  const pausedBySale = pubs.some((p) => p.desiredState === 'PAUSADO' && p.pausedReason === 'VENDA_EM_ANDAMENTO' || p.desiredState === 'REMOVIDO' && p.pausedReason === 'VENDA_EM_ANDAMENTO')
  const act = saleAction(v.stockStatus, v.active, settings.sale, pausedBySale)
  let affected = 0
  for (const p of pubs) {
    const spec = channelSpec(p.channel)
    if (act.kind === 'REMOVE') {
      if (p.desiredState === 'REMOVIDO' && p.archiveReason === act.archive) continue
      const r = await applyIntent(tenantId, p.id, 'RETIRAR', actor, { reason: act.reason, archive: act.archive ?? null, sold: act.reason === 'VENDIDO' })
      if (r.ok) affected++
    } else if (act.kind === 'PAUSE') {
      if (p.desiredState !== 'PUBLICADO') continue
      const canPause = spec?.capabilities.pause === 'SIM'
      if (!canPause && settings.sale.whenNoPause === 'RETIRAR') {
        const r = await applyIntent(tenantId, p.id, 'RETIRAR', actor, { reason: 'VENDA_EM_ANDAMENTO', archive: null, sold: true })
        if (r.ok) { await prisma.publication.update({ where: { id: p.id }, data: { pausedReason: 'VENDA_EM_ANDAMENTO' } }); affected++ }
      } else {
        const r = await applyIntent(tenantId, p.id, 'PAUSAR', actor, { reason: 'VENDA_EM_ANDAMENTO', sold: true })
        if (r.ok) affected++
      }
    } else if (act.kind === 'RESUME') {
      if (p.pausedReason !== 'VENDA_EM_ANDAMENTO' || p.desiredState === 'PUBLICADO') continue
      const r = await applyIntent(tenantId, p.id, 'RETOMAR', actor, { reason: 'VENDA_CANCELADA' })
      if (r.ok) affected++
    }
  }
  if (affected) await logEvent(prisma, { tenantId, vehicleId, type: 'VENDA', message: `Estoque "${String(v.stockStatus).toLowerCase().replace(/_/g, ' ')}": ${act.kind === 'REMOVE' ? 'anúncios retirados' : act.kind === 'PAUSE' ? 'anúncios pausados' : 'anúncios reativados'} (${affected}).`, actor })
  return { action: act.kind, affected }
}

/** Versão tolerante para ganchos de outras rotas: nunca derruba a operação principal. */
export function notifyStockChanged(tenantId: string | null | undefined, vehicleIds: Array<string | null | undefined>, actor?: Actor): void {
  if (!tenantId) return
  const ids = [...new Set(vehicleIds.filter((x): x is string => !!x))]
  if (!ids.length) return
  const work = async () => {
    let touched = 0
    for (const id of ids) {
      const r = await onVehicleStockChanged(tenantId, id, actor ?? SYSTEM_ACTOR).catch((e) => { console.error('[publications] onVehicleStockChanged', id, e); return { affected: 0 } })
      touched += r.affected
    }
    if (touched) {
      const { runWorker } = await import('./worker')
      await runWorker({ maxJobs: 20, deadlineMs: 45_000 }).catch((e) => console.error('[publications] worker (venda)', e))
    }
  }
  // Depois da resposta (serverless mantém a função viva); fora de requisição roda direto.
  try { after(work) } catch { void work() }
}

// ── Desconectar conta ─────────────────────────────────────────────────────────

export async function disconnectConnection(tenantId: string, connectionId: string, actor: Actor): Promise<{ ok: boolean; cancelledJobs: number; liveAds: number; message: string }> {
  const conn = await prisma.publicationConnection.findFirst({ where: { id: connectionId, tenantId } })
  if (!conn) return { ok: false, cancelledJobs: 0, liveAds: 0, message: 'Conta não encontrada.' }
  if (conn.channel === 'SITE') return { ok: false, cancelledJobs: 0, liveAds: 0, message: 'O site próprio não é desconectado por aqui (use Site › Configurações).' }
  return prisma.$transaction(async (tx) => {
    const pubs = await tx.publication.findMany({ where: { tenantId, connectionId, archivedAt: null }, select: { id: true, remoteId: true, confirmedState: true, remoteUrl: true, status: true, vehicleId: true } })
    const cancelled = await tx.publicationJob.updateMany({ where: { tenantId, publicationId: { in: pubs.map((p) => p.id) }, status: { in: ['PENDENTE'] } }, data: { status: 'CANCELADO', lastError: 'Conta desconectada.', finishedAt: new Date() } })
    const live = pubs.filter((p) => p.remoteId && (p.confirmedState === 'PUBLICADO' || p.confirmedState === 'PAUSADO' || p.confirmedState === 'EM_ANALISE'))
    for (const p of live) {
      await tx.publication.update({ where: { id: p.id }, data: { status: 'ACAO_MANUAL', manualAction: `Conta desconectada: o anúncio continua no ${conn.label}. Retire pelo portal${p.remoteUrl ? ` (${p.remoteUrl})` : ''} ou reconecte a conta.` } })
    }
    await tx.publication.updateMany({ where: { tenantId, connectionId, archivedAt: null, remoteId: null, status: { in: ['NA_FILA', 'AGENDADO', 'ENVIANDO'] } }, data: { status: 'PRONTO', scheduledAt: null } })
    await tx.publicationConnection.update({ where: { id: conn.id }, data: { status: 'NAO_CONECTADO', secretsEncrypted: null, maskedHints: Prisma.DbNull, tokenExpiresAt: null, disconnectedAt: new Date(), lastError: null } })
    await logEvent(tx, { tenantId, channel: conn.channel, type: 'DESCONECTADA', message: `Conta ${conn.label} desconectada. ${cancelled.count} envio(s) pendente(s) cancelado(s); ${live.length} anúncio(s) continuam no portal.`, actor })
    return { ok: true, cancelledJobs: cancelled.count, liveAds: live.length, message: live.length ? `${live.length} anúncio(s) continuam publicados no portal e não serão mais atualizados nem retirados automaticamente.` : 'Conta desconectada. Nenhum anúncio ativo nela.' }
  })
}

/** Depois de reconectar: libera as tarefas travadas por autenticação. */
export async function releaseBlockedJobs(tenantId: string, connectionId: string) {
  const pubs = await prisma.publication.findMany({ where: { tenantId, connectionId }, select: { id: true } })
  await prisma.publicationJob.updateMany({ where: { tenantId, publicationId: { in: pubs.map((p) => p.id) }, status: 'BLOQUEADO', lastErrorKind: 'AUTH' }, data: { status: 'PENDENTE', runAt: new Date(), attempts: 0 } })
}

// ── Fotos / conteúdo aprovados ────────────────────────────────────────────────

export function mediaHash(photos: string[]): string { return payloadHash({ title: '', description: '', caption: '', price: null, oldPrice: null, photos, options: [], conditions: '', vehicle: { id: '' }, contacts: {}, location: {}, reference: '', storeName: '', isNew: false }) }

/** Registra uma revisão de mídia pendente (painel "Preparar publicação" ou estúdio). */
export async function proposeMedia(tenantId: string, vehicleId: string, photos: string[], origin: 'PAINEL' | 'ESTUDIO' | 'CENTRAL', actor: Actor) {
  const hash = mediaHash(photos)
  const last = await prisma.publicationRevision.findFirst({ where: { vehicleId, kind: 'MEDIA' }, orderBy: { number: 'desc' } })
  if (last && last.hash === hash && last.status !== 'SUBSTITUIDA') return last
  return prisma.publicationRevision.create({ data: { tenantId, vehicleId, kind: 'MEDIA', number: (last?.number ?? 0) + 1, hash, payload: { photos } as Prisma.InputJsonValue, status: 'PENDENTE', origin, createdById: actor.id } })
}

/**
 * Aprova capa + ordem das fotos. Grava a revisão aprovada, atualiza o
 * conteúdo-base e, com a regra automática LIGADA pela empresa, publica nos
 * destinos escolhidos. Anúncios vivos recebem atualização.
 */
export async function approveMedia(tenantId: string, vehicleId: string, photos: string[], actor: Actor): Promise<{ revisionId: string; autoPublished: CreateResult[]; updates: number }> {
  const v = await loadVehicle(tenantId, vehicleId)
  if (!v) throw new Error('Veículo não encontrado nesta loja.')
  const allowed = new Set([...v.photos.map((p) => p.url), ...(Array.isArray(v.siteListing?.originalPhotos) ? (v.siteListing!.originalPhotos as unknown[]).filter((x): x is string => typeof x === 'string') : [])])
  const clean = photos.filter((u) => allowed.has(u))
  if (!clean.length) throw new Error('Escolha ao menos uma foto do veículo.')
  const hash = mediaHash(clean)
  const rev = await prisma.$transaction(async (tx) => {
    const last = await tx.publicationRevision.findFirst({ where: { vehicleId, kind: 'MEDIA' }, orderBy: { number: 'desc' } })
    await tx.publicationRevision.updateMany({ where: { vehicleId, kind: 'MEDIA', status: 'APROVADA' }, data: { status: 'SUBSTITUIDA' } })
    const r = await tx.publicationRevision.create({ data: { tenantId, vehicleId, kind: 'MEDIA', number: (last?.number ?? 0) + 1, hash, payload: { photos: clean } as Prisma.InputJsonValue, status: 'APROVADA', origin: 'CENTRAL', createdById: actor.id, approvedById: actor.id, approvedAt: new Date() } })
    await tx.publicationDraft.upsert({
      where: { vehicleId },
      create: { tenantId, vehicleId, photos: json(clean), mediaRevisionId: r.id, approvedById: actor.id, approvedAt: new Date(), updatedById: actor.id },
      update: { photos: json(clean), mediaRevisionId: r.id, approvedById: actor.id, approvedAt: new Date(), updatedById: actor.id },
    })
    await logEvent(tx, { tenantId, vehicleId, type: 'FOTOS_APROVADAS', message: `Fotos aprovadas (${clean.length}, revisão ${r.number}).`, actor, data: { capa: clean[0] } })
    return r
  })
  const updates = await syncLive(tenantId, vehicleId, actor)
  const settings = await loadPublicationSettings(tenantId)
  let autoPublished: CreateResult[] = []
  if (settings.autoPublish.enabled && settings.autoPublish.connectionIds.length && isPublishableStock(v.stockStatus, v.active)) {
    const existing = new Set((await prisma.publication.findMany({ where: { tenantId, vehicleId, archivedAt: null }, select: { connectionId: true } })).map((p) => p.connectionId))
    const targets = settings.autoPublish.connectionIds.filter((c) => !existing.has(c)).map((connectionId) => ({ vehicleId, connectionId }))
    if (targets.length) {
      autoPublished = await createPublications(tenantId, targets, { mode: 'AGORA', actor: { id: settings.autoPublish.enabledById, name: `Regra automática (ativada por ${settings.autoPublish.enabledByName ?? 'gestor'})` } })
    }
  }
  return { revisionId: rev.id, autoPublished, updates }
}

/** Anúncios vivos cujo conteúdo mudou → tarefa de atualização. */
export async function syncLive(tenantId: string, vehicleId: string, actor: Actor): Promise<number> {
  const pubs = await prisma.publication.findMany({ where: { tenantId, vehicleId, archivedAt: null, desiredState: 'PUBLICADO', confirmedState: { in: ['PUBLICADO', 'EM_ANALISE'] } } })
  if (!pubs.length) return 0
  const v = await loadVehicle(tenantId, vehicleId)
  if (!v || !isPublishableStock(v.stockStatus, v.active)) return 0
  const ctx = await payloadContext(tenantId)
  let n = 0
  for (const p of pubs) {
    const spec = channelSpec(p.channel)
    if (!spec || spec.capabilities.update === 'NAO' || !getConnector(p.channel)?.update) continue
    const payload = await buildFor(tenantId, v, p.externalRef, p.overrides, ctx)
    const h = payloadHash(payload)
    if (h === p.sentRevisionHash) continue
    const done = await prisma.$transaction(async (tx) => {
      await lockPublication(tx, p.id)
      const cur = (await tx.publication.findUnique({ where: { id: p.id } }))!
      const r = await enqueue(tx, cur, 'ATUALIZAR', { actorId: actor.id, revisionHash: h })
      if (r.created) await tx.publication.update({ where: { id: p.id }, data: { status: 'ATUALIZACAO_PENDENTE' } })
      return r.created
    })
    if (done) n++
  }
  return n
}

export type { ChannelSpec }
