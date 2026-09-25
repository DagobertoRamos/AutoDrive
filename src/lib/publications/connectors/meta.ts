// =============================================================================
// Conectores Meta — capacidades DIFERENTES e separadas:
//   • META_PAGE  post na Página (Graph API, token de Página)
//   • INSTAGRAM  post/carrossel na conta profissional (Content Publishing)
// Catálogo (feed), anúncios pagos e Marketplace são outras coisas: publicar
// na Página não comprova Marketplace e vice-versa.
// Fontes: developers.facebook.com/documentation/pages-api/posts e
//         .../instagram-platform/content-publishing (lidas em 25/09/2026).
// Versão da Graph API: META_GRAPH_VERSION (padrão abaixo).
// =============================================================================

import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import { channelText, type ListingPayload } from '../content-core'
import type { HttpResponse } from './http'
import type { Connector, ConnectorContext, RemoteRef } from './types'

const pageSpec = channelSpec('META_PAGE')!
const igSpec = channelSpec('INSTAGRAM')!
export const graphBase = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}`

/** Erro da Graph API (error.code) → erro tipado. */
export function graphError(res: HttpResponse, what: string): ConnectorError | null {
  if (res.status >= 200 && res.status < 300) return null
  const e = res.json<{ error?: { message?: string; code?: number; error_subcode?: number; type?: string } }>()?.error
  const code = e?.code
  const msg = `${what}: ${e?.message ?? `HTTP ${res.status}`}`.slice(0, 400)
  if (code === 190 || code === 102 || e?.type === 'OAuthException' && (code === 10 || code === 200)) {
    return new ConnectorError('AUTH', msg, 'Reconecte a Página/Instagram em Canais conectados (token expirado ou permissão removida).', { code: String(code) })
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || res.status === 429) return new ConnectorError('RATE_LIMIT', msg, undefined, { code: String(code ?? 429), retryAfterMs: 15 * 60_000 })
  if (code === 9 || code === 36003) return new ConnectorError('QUOTA', msg, undefined, { code: String(code) })
  if (code === 1 || code === 2 || res.status >= 500) return new ConnectorError('UNAVAILABLE', msg, undefined, { code: String(code ?? res.status) })
  if (code === 100 && /does not exist|nonexisting|Unsupported get request/i.test(e?.message ?? '')) return new ConnectorError('NOT_FOUND', msg, undefined, { code: '100' })
  return new ConnectorError('VALIDATION', msg, undefined, { code: String(code ?? res.status) })
}

async function graph<T>(ctx: ConnectorContext, method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string> = {}, what = 'Meta', creates = false): Promise<T> {
  const token = ctx.secrets.page_access_token
  if (!token) throw new ConnectorError('AUTH', 'Página não autorizada.', 'Conecte a Página em Canais conectados.')
  const qs = new URLSearchParams({ ...params, access_token: token })
  const res = method === 'GET' || method === 'DELETE'
    ? await ctx.http.request({ method, url: `${graphBase()}${path}?${qs}` })
    : await ctx.http.request({ method, url: `${graphBase()}${path}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs, creates })
  const err = graphError(res, what)
  if (err) throw err
  return (res.json<T>() ?? ({} as T))
}

// ── Página ──────────────────────────────────────────────────────────────────

export const metaPageConnector: Connector = {
  spec: pageSpec,
  async testConnection(ctx) {
    const j = await graph<{ id: string; name?: string }>(ctx, 'GET', `/${ctx.connection.externalAccountId}`, { fields: 'id,name' }, 'Página')
    return { ok: true, message: 'Página autorizada.', account: j.name ?? j.id }
  },
  async publish(p, ctx) {
    const page = ctx.connection.externalAccountId
    const photos = p.photos.slice(0, pageSpec.media.max)
    const ids: string[] = []
    for (const u of photos) {
      // Foto sem publicar: vira anexo do post (não aparece solta na Página).
      const r = await graph<{ id: string }>(ctx, 'POST', `/${page}/photos`, { url: ctx.mediaUrl(u), published: 'false' }, 'Foto')
      ids.push(r.id)
    }
    const params: Record<string, string> = { message: channelText(p, pageSpec).description }
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }) })
    const post = await graph<{ id: string }>(ctx, 'POST', `/${page}/feed`, params, 'Post', true)
    return { state: 'EM_ANALISE', remoteId: post.id, message: 'Post criado; conferindo.' }
  },
  async get(ref, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    try {
      const j = await graph<{ id: string; permalink_url?: string; is_published?: boolean }>(ctx, 'GET', `/${ref.remoteId}`, { fields: 'id,permalink_url,is_published' }, 'Post')
      return { state: j.is_published === false ? 'EM_ANALISE' : 'PUBLICADO', remoteId: j.id, remoteUrl: j.permalink_url ?? `https://www.facebook.com/${j.id}`, remoteStatus: j.is_published === false ? 'não publicado' : 'publicado' }
    } catch (e) {
      if (e instanceof ConnectorError && e.kind === 'NOT_FOUND') return { state: 'NAO_ENCONTRADO', remoteId: ref.remoteId }
      throw e
    }
  },
  async update(ref, p, ctx) {
    // Só o texto pode ser editado (e só de posts criados pelo app). Fotos não.
    await graph(ctx, 'POST', `/${ref.remoteId}`, { message: channelText(p, pageSpec).description }, 'Editar post')
    const r = await this.get!(ref, ctx)
    return { ...r, message: 'Texto e preço atualizados. As fotos de um post publicado não são trocadas: crie nova campanha se precisar.' }
  },
  async remove(ref, _reason, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    try { await graph(ctx, 'DELETE', `/${ref.remoteId}`, {}, 'Excluir post') } catch (e) {
      if (!(e instanceof ConnectorError && e.kind === 'NOT_FOUND')) throw e
    }
    return { state: 'REMOVIDO', remoteId: ref.remoteId }
  },
}

// ── Instagram ───────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitContainer(ctx: ConnectorContext, id: string, tries = 6, waitMs = 4_000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const s = await graph<{ status_code?: string }>(ctx, 'GET', `/${id}`, { fields: 'status_code' }, 'Instagram (processamento)')
    if (s.status_code === 'FINISHED') return
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new ConnectorError('VALIDATION', `Instagram recusou a mídia (${s.status_code}).`, 'Confira se as fotos são JPEG acessíveis e com proporção aceita.')
    await sleep(waitMs)
  }
  throw new ConnectorError('UNAVAILABLE', 'Instagram ainda processando as fotos; nova tentativa em instantes.')
}

export const instagramConnector: Connector = {
  spec: igSpec,
  async testConnection(ctx) {
    const j = await graph<{ id: string; username?: string }>(ctx, 'GET', `/${ctx.connection.externalAccountId}`, { fields: 'id,username' }, 'Instagram')
    const lim = await this.limits!(ctx).catch(() => ({}))
    return { ok: true, message: 'Conta profissional autorizada.', account: j.username ? `@${j.username}` : j.id, quota: lim }
  },
  async limits(ctx) {
    const j = await graph<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number; quota_duration?: number } }> }>(ctx, 'GET', `/${ctx.connection.externalAccountId}/content_publishing_limit`, { fields: 'quota_usage,config' }, 'Limite')
    const d = j.data?.[0] ?? {}
    return { usado: d.quota_usage ?? null, total: d.config?.quota_total ?? null, janelaSegundos: d.config?.quota_duration ?? null }
  },
  async publish(p: ListingPayload, ctx) {
    const ig = ctx.connection.externalAccountId
    const lim = await this.limits!(ctx) as { usado: number | null; total: number | null }
    if (lim.total != null && lim.usado != null && lim.usado >= lim.total) throw new ConnectorError('QUOTA', `Limite de ${lim.total} posts por API em 24 h atingido.`, 'Aguarde a janela de 24 h do Instagram.')
    const caption = channelText(p, igSpec).description
    const photos = p.photos.slice(0, igSpec.media.max)
    let creation: string
    if (photos.length === 1) {
      creation = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { image_url: ctx.mediaUrl(photos[0]), caption }, 'Instagram (mídia)')).id
    } else {
      const children: string[] = []
      for (const u of photos) children.push((await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { image_url: ctx.mediaUrl(u), is_carousel_item: 'true' }, 'Instagram (item)')).id)
      for (const c of children) await waitContainer(ctx, c)
      creation = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, 'Instagram (carrossel)')).id
    }
    await waitContainer(ctx, creation)
    const media = await graph<{ id: string }>(ctx, 'POST', `/${ig}/media_publish`, { creation_id: creation }, 'Instagram (publicar)', true)
    return this.get!({ vehicleId: p.vehicle.id, remoteId: media.id, externalRef: p.reference }, ctx)
  },
  async get(ref, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    try {
      const j = await graph<{ id: string; permalink?: string }>(ctx, 'GET', `/${ref.remoteId}`, { fields: 'id,permalink,timestamp' }, 'Instagram')
      return { state: 'PUBLICADO', remoteId: j.id, remoteUrl: j.permalink ?? null, remoteStatus: 'publicado' }
    } catch (e) {
      if (e instanceof ConnectorError && e.kind === 'NOT_FOUND') return { state: 'NAO_ENCONTRADO', remoteId: ref.remoteId }
      throw e
    }
  },
  /** Timeout no media_publish: procura o post recente com a mesma legenda antes de repetir. */
  async findByReference(_ref: RemoteRef, p, ctx) {
    if (!p) return null
    const caption = channelText(p, igSpec).description.trim()
    const j = await graph<{ data?: Array<{ id: string; caption?: string; permalink?: string }> }>(ctx, 'GET', `/${ctx.connection.externalAccountId}/media`, { fields: 'id,caption,permalink,timestamp', limit: '10' }, 'Instagram')
    const hit = (j.data ?? []).find((m) => (m.caption ?? '').trim() === caption)
    return hit ? { state: 'PUBLICADO', remoteId: hit.id, remoteUrl: hit.permalink ?? null } : null
  },
  // update/pause/resume/remove: não oferecidos pela API de publicação → pendência manual (ver worker).
}

