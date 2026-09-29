// =============================================================================
// Conectores Meta — capacidades DIFERENTES e separadas:
//   • META_PAGE  post na Página (Graph API, token de Página)
//   • INSTAGRAM  post/carrossel na conta profissional (Content Publishing)
// Catálogo (feed), anúncios pagos e Marketplace são outras coisas: publicar
// na Página não comprova Marketplace e vice-versa.
// Fontes: developers.facebook.com/documentation/pages-api/posts e
//         .../instagram-platform/content-publishing (lidas em 25/09/2026).
// Estúdio social (payload.social): Post/Carrossel com arte na capa, Story
// (Instagram: media_type STORIES; Página: /photo_stories) e Reels (Instagram:
// media_type REELS processado em segundo plano; Página: /video_reels em 3
// fases com file_url). Sem formato = post com as fotos (comportamento antigo).
// Versão da Graph API: META_GRAPH_VERSION (padrão abaixo).
// =============================================================================

import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import { channelText, type ListingPayload } from '../content-core'
import type { HttpResponse } from './http'
import type { Connector, ConnectorContext, RemoteRef, RemoteResult } from './types'
import type { SocialSpec } from '../social/formats'
import { musicPlan } from '../social/music-core'

const pageSpec = channelSpec('META_PAGE')!
const igSpec = channelSpec('INSTAGRAM')!
export const graphBase = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}`

/** Erro da Graph API (error.code) → erro tipado. */
export function graphError(res: HttpResponse, what: string): ConnectorError | null {
  if (res.status >= 200 && res.status < 300) return null
  const e = res.json<{ error?: { message?: string; code?: number; error_subcode?: number; type?: string } }>()?.error
  const code = e?.code
  const msg = `${what}: ${e?.message ?? `HTTP ${res.status}`}`.slice(0, 400)
  // Post apagado/inexistente: o Facebook às vezes responde #10 ("does not exist ... missing permission").
  // Não é login vencido — o post simplesmente não está mais lá.
  if ((code === 10 || code === 100) && /does not exist|nonexisting|Unsupported get request/i.test(e?.message ?? '')) return new ConnectorError('NOT_FOUND', msg, undefined, { code: String(code) })
  // Só token vencido/revogado trava a conta inteira; permissão num item isolado não.
  if (code === 190 || code === 102) {
    return new ConnectorError('AUTH', msg, 'Reconecte a Página/Instagram em Canais conectados (token expirado ou permissão removida).', { code: String(code) })
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || res.status === 429) return new ConnectorError('RATE_LIMIT', msg, undefined, { code: String(code ?? 429), retryAfterMs: 15 * 60_000 })
  if (code === 9 || code === 36003) return new ConnectorError('QUOTA', msg, undefined, { code: String(code) })
  if (code === 1 || code === 2 || res.status >= 500) return new ConnectorError('UNAVAILABLE', msg, undefined, { code: String(code ?? res.status) })
  if ((code === 10 || code === 200) && e?.type === 'OAuthException') return new ConnectorError('VALIDATION', msg, 'A conta conectada não tem permissão para este item. Se repetir em todos os envios, reconecte em Canais conectados.', { code: String(code) })
  return new ConnectorError('VALIDATION', msg, undefined, { code: String(code ?? res.status) })
}

export async function graph<T>(ctx: ConnectorContext, method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string> = {}, what = 'Meta', creates = false): Promise<T> {
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

/** Fotos do post: com formato social, a 1ª vira a arte (Post = só a arte). */
function feedPhotos(p: ListingPayload, ctx: ConnectorContext, max: number): string[] {
  const photos = p.photos.slice(0, max)
  const s = p.social
  if (!s || !ctx.social || !photos.length) return photos.map((u) => ctx.mediaUrl(u))
  const art = ctx.social.artUrl(photos[0], p, s.format === 'CARROSSEL' ? 'CARROSSEL' : 'POST', s.template)
  if (s.format === 'POST') return [art]
  return [art, ...photos.slice(1).map((u) => ctx.mediaUrl(u))]
}

function needStudio(ctx: ConnectorContext, s: SocialSpec) {
  if (!ctx.social) throw new ConnectorError('CONFIG', `O formato ${s.format.toLowerCase()} precisa do estúdio de artes, indisponível nesta execução.`)
  return ctx.social
}

const STORY_OK: RemoteResult['state'] = 'PUBLICADO'

/**
 * Envio do vídeo para a Página (fase "upload" do rupload) com o ARQUIVO no
 * corpo (offset 0, tamanho total) — não depende do Facebook conseguir baixar
 * o nosso link. Erro do rupload vem em debug_info.
 */
export async function rupload(ctx: ConnectorContext, videoId: string, bytes: Uint8Array, what: string) {
  const version = graphBase().split('/').pop()
  const up = await ctx.http.request({ method: 'POST', url: `https://rupload.facebook.com/video-upload/${version}/${videoId}`, headers: { Authorization: `OAuth ${ctx.secrets.page_access_token}`, offset: '0', file_size: String(bytes.length), 'Content-Type': 'application/octet-stream' }, body: bytes, timeoutMs: 120_000 })
  if (up.status >= 200 && up.status < 300) return
  const dbg = up.json<{ debug_info?: { message?: string; type?: string } }>()?.debug_info
  const e = graphError(up, dbg?.message ? `${what}: ${dbg.message}${dbg.type ? ` (${dbg.type})` : ''}` : what) ?? new ConnectorError('UNAVAILABLE', `${what}: HTTP ${up.status}`)
  throw e.kind === 'VALIDATION' && !e.hint ? new ConnectorError('VALIDATION', e.message, VIDEO_HINT, e.opts) : e
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
    const s = p.social
    const music = s ? musicPlan(s.music ?? null, 'META_PAGE', s.format) : null
    if (s?.format === 'STORY' && music) {
      // Story com música = story em vídeo (a trilha vai embutida).
      const vid = await needStudio(ctx, s).video(p, 'CLIP', { format: 'STORY', template: s.template, embedMusic: true })
      const start = await graph<{ video_id: string }>(ctx, 'POST', `/${page}/video_stories`, { upload_phase: 'start' }, 'Story em vídeo (início)')
      await rupload(ctx, start.video_id, vid.bytes, 'Story em vídeo (envio)')
      const st = await graph<{ post_id?: string }>(ctx, 'POST', `/${page}/video_stories`, { upload_phase: 'finish', video_id: start.video_id }, 'Story em vídeo', true)
      return { state: STORY_OK, remoteId: st.post_id ?? start.video_id, remoteStatus: 'story com música (some em 24 h)', message: 'Story com música publicado na Página.' }
    }
    if (s?.format === 'POST' && music) {
      // Post com música = vídeo curto da arte no feed da Página.
      const { url } = await needStudio(ctx, s).video(p, 'CLIP', { format: 'POST', template: s.template, embedMusic: true })
      const v = await graph<{ id: string }>(ctx, 'POST', `/${page}/videos`, { file_url: url, description: channelText(p, pageSpec).description, published: 'true' }, 'Post em vídeo', true)
      return { state: 'EM_ANALISE', remoteId: v.id, message: 'Post com música enviado; o Facebook está processando o vídeo.' }
    }
    if (s?.format === 'STORY') {
      const art = needStudio(ctx, s).artUrl(p.photos[0], p, 'STORY', s.template)
      const photo = await graph<{ id: string }>(ctx, 'POST', `/${page}/photos`, { url: art, published: 'false' }, 'Story (foto)')
      const st = await graph<{ post_id?: string; id?: string }>(ctx, 'POST', `/${page}/photo_stories`, { photo_id: photo.id }, 'Story', true)
      return { state: STORY_OK, remoteId: st.post_id ?? st.id ?? photo.id, remoteStatus: 'story (some em 24 h)', message: 'Story publicado na Página.' }
    }
    if (s?.format === 'VIDEO') {
      // Vídeo gravado do carro como Reels da Página (arquivo enviado direto).
      const bytes = await needStudio(ctx, s).carVideo(p)
      const start = await graph<{ video_id: string }>(ctx, 'POST', `/${page}/video_reels`, { upload_phase: 'start' }, 'Vídeo do carro (início)')
      await rupload(ctx, start.video_id, bytes, 'Vídeo do carro (envio)')
      await graph(ctx, 'POST', `/${page}/video_reels`, { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: channelText(p, pageSpec).description }, 'Vídeo do carro (publicar)', true)
      return { state: 'EM_ANALISE', remoteId: start.video_id, message: 'Vídeo do carro enviado; o Facebook está processando.' }
    }
    if (s?.format === 'REELS') {
      const vid = await needStudio(ctx, s).video(p, 'REELS', { format: 'REELS', template: s.template, embedMusic: music === 'EMBED' })
      const start = await graph<{ video_id: string }>(ctx, 'POST', `/${page}/video_reels`, { upload_phase: 'start' }, 'Reels (início)')
      await rupload(ctx, start.video_id, vid.bytes, 'Reels (envio do vídeo)')
      await graph(ctx, 'POST', `/${page}/video_reels`, { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: channelText(p, pageSpec).description }, 'Reels (publicar)', true)
      return { state: 'EM_ANALISE', remoteId: start.video_id, message: 'Reels enviado; o Facebook está processando o vídeo.' }
    }
    const ids: string[] = []
    for (const u of feedPhotos(p, ctx, pageSpec.media.max)) {
      // Foto sem publicar: vira anexo do post (não aparece solta na Página).
      const r = await graph<{ id: string }>(ctx, 'POST', `/${page}/photos`, { url: u, published: 'false' }, 'Foto')
      ids.push(r.id)
    }
    const params: Record<string, string> = { message: channelText(p, pageSpec).description }
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }) })
    const post = await graph<{ id: string }>(ctx, 'POST', `/${page}/feed`, params, 'Post', true)
    return { state: 'EM_ANALISE', remoteId: post.id, message: 'Post criado; conferindo.' }
  },
  async get(ref, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    // Story some sozinho em 24 h: publicado é publicado (não vira "falha").
    if (ref.format === 'STORY') return { state: STORY_OK, remoteId: ref.remoteId, remoteStatus: 'story (some em 24 h)' }
    if (ref.format === 'REELS' || ref.video) {
      try {
        const v = await graph<{ id: string; permalink_url?: string; status?: { video_status?: string; processing_phase?: { errors?: Array<{ message?: string }> } } }>(ctx, 'GET', `/${ref.remoteId}`, { fields: 'id,permalink_url,status' }, 'Reels')
        const st = v.status?.video_status
        const link = v.permalink_url ? (v.permalink_url.startsWith('http') ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : null
        if (st === 'error') return { state: 'REJEITADO', remoteId: v.id, remoteStatus: 'erro no processamento', message: v.status?.processing_phase?.errors?.[0]?.message ?? 'O Facebook não conseguiu processar o vídeo.' }
        if (st === 'ready' || st === 'published') return { state: 'PUBLICADO', remoteId: v.id, remoteUrl: link, remoteStatus: ref.format === 'REELS' ? 'Reels no ar' : 'vídeo no ar' }
        return { state: 'EM_ANALISE', remoteId: v.id, remoteUrl: link, remoteStatus: `processando (${st ?? 'aguardando'})` }
      } catch (e) {
        if (e instanceof ConnectorError && e.kind === 'NOT_FOUND') return { state: 'NAO_ENCONTRADO', remoteId: ref.remoteId }
        throw e
      }
    }
    try {
      const j = await graph<{ id: string; permalink_url?: string; is_published?: boolean }>(ctx, 'GET', `/${ref.remoteId}`, { fields: 'id,permalink_url,is_published' }, 'Post')
      return { state: j.is_published === false ? 'EM_ANALISE' : 'PUBLICADO', remoteId: j.id, remoteUrl: j.permalink_url ?? `https://www.facebook.com/${j.id}`, remoteStatus: j.is_published === false ? 'não publicado' : 'publicado' }
    } catch (e) {
      if (e instanceof ConnectorError && e.kind === 'NOT_FOUND') return { state: 'NAO_ENCONTRADO', remoteId: ref.remoteId }
      throw e
    }
  },
  async update(ref, p, ctx) {
    if (ref.format === 'STORY' || ref.format === 'REELS' || ref.video) return { ...(await this.get!(ref, ctx)), message: 'Story, Reels e vídeos não são editáveis: o preço novo entra nas próximas publicações.' }
    // Só o texto pode ser editado (e só de posts criados pelo app). Fotos não.
    await graph(ctx, 'POST', `/${ref.remoteId}`, { message: channelText(p, pageSpec).description }, 'Editar post')
    const r = await this.get!(ref, ctx)
    return { ...r, message: 'Texto e preço atualizados. As fotos de um post publicado não são trocadas: crie nova campanha se precisar.' }
  },
  async remove(ref, _reason, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    if (ref.format === 'STORY') return { state: 'REMOVIDO', remoteId: ref.remoteId, message: 'Story some sozinho em até 24 h.' }
    try { await graph(ctx, 'DELETE', `/${ref.remoteId}`, {}, ref.format === 'REELS' ? 'Excluir Reels' : 'Excluir post') } catch (e) {
      if (!(e instanceof ConnectorError && e.kind === 'NOT_FOUND')) throw e
    }
    return { state: 'REMOVIDO', remoteId: ref.remoteId }
  },
}

// ── Instagram ───────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function waitContainer(ctx: ConnectorContext, id: string, tries = 6, waitMs = 4_000, hint = 'Confira se as fotos são JPEG acessíveis e com proporção aceita.'): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const s = await graph<{ status_code?: string; status?: string }>(ctx, 'GET', `/${id}`, { fields: 'status_code,status' }, 'Instagram (processamento)')
    if (s.status_code === 'FINISHED') return
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new ConnectorError('VALIDATION', `Instagram recusou a mídia (${s.status_code}${s.status && s.status !== s.status_code ? `: ${s.status}` : ''}).`, hint)
    await sleep(waitMs)
  }
  throw new ConnectorError('UNAVAILABLE', 'Instagram ainda processando a mídia; nova tentativa em instantes.')
}

/** Vídeo leva mais tempo para processar (a rotina tem até 5 min). */
export const waitVideo = (ctx: ConnectorContext, id: string) => waitContainer(ctx, id, 30, 5_000, 'Vídeo precisa ser MP4 (H.264/AAC), vertical 9:16, de 3 a 60 s.')

const VIDEO_HINT = 'A rede recusou o arquivo de vídeo (não é problema nos dados do carro). Use "Tentar de novo"; se repetir, publique como Post ou Story com foto.'

/** Envio retomável do Instagram: o arquivo inteiro no corpo (offset 0). */
async function igRupload(ctx: ConnectorContext, containerId: string, bytes: Uint8Array): Promise<void> {
  const version = graphBase().split('/').pop()
  const up = await ctx.http.request({ method: 'POST', url: `https://rupload.facebook.com/ig-api-upload/${version}/${containerId}`, headers: { Authorization: `OAuth ${ctx.secrets.page_access_token}`, offset: '0', file_size: String(bytes.length), 'Content-Type': 'application/octet-stream' }, body: bytes, timeoutMs: 180_000 })
  if (up.status >= 200 && up.status < 300) return
  const dbg = up.json<{ debug_info?: { message?: string } }>()?.debug_info?.message
  const e = graphError(up, dbg ? `Instagram (envio do vídeo): ${dbg}` : 'Instagram (envio do vídeo)') ?? new ConnectorError('UNAVAILABLE', `Instagram (envio do vídeo): HTTP ${up.status}`)
  throw e.kind === 'VALIDATION' && !e.hint ? new ConnectorError('VALIDATION', e.message, VIDEO_HINT, e.opts) : e
}

/** Parâmetro oficial para anexar música da biblioteca do Instagram ao Reels (vídeo nosso vai mudo). */
function igAudio(s: SocialSpec): Record<string, string> {
  const m = s.music
  if (!m || m.mode !== 'TRACK' || m.source !== 'IG') return {}
  return { audio_configuration: JSON.stringify({ audio_id: m.id, audio_volume: 100, video_volume: 0 }) }
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
    const s = p.social
    const music = s ? musicPlan(s.music ?? null, 'INSTAGRAM', s.format) : null
    if (s?.format === 'STORY' && music) {
      // Story com música = story em vídeo (a Audio API não anexa música a story).
      // O arquivo vai direto ao Instagram (envio retomável), sem depender de ele baixar o nosso link.
      const { bytes } = await needStudio(ctx, s).video(p, 'CLIP', { format: 'STORY', template: s.template, embedMusic: true })
      try {
        const c = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { media_type: 'STORIES', upload_type: 'resumable' }, 'Instagram (story em vídeo)')).id
        await igRupload(ctx, c, bytes)
        await waitVideo(ctx, c)
        const media = await graph<{ id: string }>(ctx, 'POST', `/${ig}/media_publish`, { creation_id: c }, 'Instagram (publicar story)', true)
        return { state: STORY_OK, remoteId: media.id, remoteStatus: 'story com música (some em 24 h)', message: 'Story com música publicado no Instagram.' }
      } catch (e) {
        if (!(e instanceof ConnectorError && e.kind === 'VALIDATION')) throw e
        // Instagram recusou o story em vídeo: publica o story com a arte (sem música) e explica.
        const art = needStudio(ctx, s).artUrl(p.photos[0], p, 'STORY', s.template)
        const ci = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { image_url: art, media_type: 'STORIES' }, 'Instagram (story)')).id
        await waitContainer(ctx, ci)
        const media = await graph<{ id: string }>(ctx, 'POST', `/${ig}/media_publish`, { creation_id: ci }, 'Instagram (publicar story)', true)
        return { state: STORY_OK, remoteId: media.id, remoteStatus: 'story sem música (some em 24 h)', message: `Story publicado com a arte, sem música: ${e.message}` }
      }
    }
    if (s?.format === 'VIDEO') {
      // Vídeo gravado do carro: envio retomável (o arquivo vai direto ao Instagram, sem limite do nosso link).
      const bytes = await needStudio(ctx, s).carVideo(p)
      const c = await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: 'true' }, 'Instagram (vídeo do carro)')
      await igRupload(ctx, c.id, bytes)
      return { state: 'EM_ANALISE', pendingToken: c.id, message: 'Vídeo do carro enviado; o Instagram está processando.' }
    }
    if (s && (s.format === 'REELS' || (s.format === 'POST' && music))) {
      // Post com música sai como vídeo curto (Reels que também aparece no feed).
      const { url } = await needStudio(ctx, s).video(p, s.format === 'REELS' ? 'REELS' : 'CLIP', { format: s.format, template: s.template, embedMusic: music === 'EMBED' })
      const c = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { media_type: 'REELS', video_url: url, caption, share_to_feed: 'true', ...(music === 'IG_LIBRARY' ? igAudio(s) : {}) }, 'Instagram (Reels)')).id
      // O Instagram processa o vídeo em segundo plano: a conferência publica quando ficar pronto.
      return { state: 'EM_ANALISE', pendingToken: c, message: s.format === 'REELS' ? 'Reels enviado; o Instagram está processando o vídeo.' : 'Post com música enviado como vídeo; o Instagram está processando.' }
    }
    if (s?.format === 'STORY') {
      const art = needStudio(ctx, s).artUrl(p.photos[0], p, 'STORY', s.template)
      const c = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { image_url: art, media_type: 'STORIES' }, 'Instagram (story)')).id
      await waitContainer(ctx, c)
      const media = await graph<{ id: string }>(ctx, 'POST', `/${ig}/media_publish`, { creation_id: c }, 'Instagram (publicar story)', true)
      return { state: STORY_OK, remoteId: media.id, remoteStatus: 'story (some em 24 h)', message: 'Story publicado no Instagram.' }
    }
    const photos = feedPhotos(p, ctx, igSpec.media.max)
    let creation: string
    if (photos.length === 1) {
      creation = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { image_url: photos[0], caption }, 'Instagram (mídia)')).id
    } else {
      const children: string[] = []
      if (s?.format === 'CARROSSEL' && music) {
        // Carrossel com música: a capa vira um vídeo curto da arte com a trilha embutida.
        const { url } = await needStudio(ctx, s).video(p, 'CLIP', { format: 'CARROSSEL', template: s.template, embedMusic: true })
        const v = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { media_type: 'VIDEO', video_url: url, is_carousel_item: 'true' }, 'Instagram (capa em vídeo)')).id
        await waitVideo(ctx, v)
        children.push(v)
        photos.shift()
      }
      for (const u of photos) children.push((await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { image_url: u, is_carousel_item: 'true' }, 'Instagram (item)')).id)
      for (const c of children) await waitContainer(ctx, c)
      creation = (await graph<{ id: string }>(ctx, 'POST', `/${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, 'Instagram (carrossel)')).id
    }
    await waitContainer(ctx, creation)
    const media = await graph<{ id: string }>(ctx, 'POST', `/${ig}/media_publish`, { creation_id: creation }, 'Instagram (publicar)', true)
    return this.get!({ vehicleId: p.vehicle.id, remoteId: media.id, externalRef: p.reference }, ctx)
  },
  async get(ref, ctx) {
    // Reels em processamento: publica quando o contêiner termina.
    if (!ref.remoteId && ref.pendingToken) {
      const st = await graph<{ status_code?: string; status?: string }>(ctx, 'GET', `/${ref.pendingToken}`, { fields: 'status_code,status' }, 'Instagram (processamento)')
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') return { state: 'REJEITADO', pendingToken: null, remoteStatus: st.status_code.toLowerCase(), message: `O Instagram recusou o vídeo (${st.status ?? st.status_code}).` }
      if (st.status_code !== 'FINISHED') return { state: 'EM_ANALISE', remoteStatus: 'processando o vídeo' }
      const media = await graph<{ id: string }>(ctx, 'POST', `/${ctx.connection.externalAccountId}/media_publish`, { creation_id: ref.pendingToken }, 'Instagram (publicar Reels)', true)
      const j = await graph<{ id: string; permalink?: string }>(ctx, 'GET', `/${media.id}`, { fields: 'id,permalink' }, 'Instagram').catch(() => ({ id: media.id, permalink: undefined }))
      return { state: 'PUBLICADO', remoteId: media.id, remoteUrl: j.permalink ?? null, pendingToken: null, remoteStatus: ref.format === 'REELS' ? 'Reels no ar' : 'vídeo no ar' }
    }
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    if (ref.format === 'STORY') return { state: STORY_OK, remoteId: ref.remoteId, remoteStatus: 'story (some em 24 h)' }
    try {
      const j = await graph<{ id: string; permalink?: string }>(ctx, 'GET', `/${ref.remoteId}`, { fields: 'id,permalink,timestamp' }, 'Instagram')
      return { state: 'PUBLICADO', remoteId: j.id, remoteUrl: j.permalink ?? null, remoteStatus: 'publicado' }
    } catch (e) {
      if (e instanceof ConnectorError && e.kind === 'NOT_FOUND') return { state: 'NAO_ENCONTRADO', remoteId: ref.remoteId }
      throw e
    }
  },
  /** Timeout no media_publish: procura o post recente com a mesma legenda antes de repetir. */
  async findByReference(ref: RemoteRef, p, ctx) {
    if (!p || ref.pendingToken || p.social?.format === 'STORY') return null
    const caption = channelText(p, igSpec).description.trim()
    const j = await graph<{ data?: Array<{ id: string; caption?: string; permalink?: string }> }>(ctx, 'GET', `/${ctx.connection.externalAccountId}/media`, { fields: 'id,caption,permalink,timestamp', limit: '10' }, 'Instagram')
    const hit = (j.data ?? []).find((m) => (m.caption ?? '').trim() === caption)
    return hit ? { state: 'PUBLICADO', remoteId: hit.id, remoteUrl: hit.permalink ?? null } : null
  },
  // update/pause/resume/remove: não oferecidos pela API de publicação → pendência manual (ver worker).
}


// ── "Ver como ficou": a mídia REAL publicada na rede ────────────────────────

export interface RemoteMedia { media: Array<{ type: 'image' | 'video'; url: string }>; caption: string; permalink: string | null }

type IgItem = { media_type?: string; media_url?: string; thumbnail_url?: string }
const igItem = (m: IgItem) => (m.media_type === 'VIDEO' && m.media_url ? { type: 'video' as const, url: m.media_url } : m.media_url || m.thumbnail_url ? { type: 'image' as const, url: (m.media_url || m.thumbnail_url)! } : null)

/**
 * Lê o post publicado (Instagram: media_url dos itens; Página: vídeo pelo
 * `source` ou foto/álbum pelos anexos). Story expirado (24 h) → null.
 */
export async function remoteMedia(ctx: ConnectorContext, channel: string, remoteId: string): Promise<RemoteMedia | null> {
  if (channel === 'INSTAGRAM') {
    const j = await graph<IgItem & { permalink?: string; caption?: string; children?: { data?: IgItem[] } }>(ctx, 'GET', `/${remoteId}`, { fields: 'media_type,media_url,thumbnail_url,permalink,caption,children{media_type,media_url,thumbnail_url}' }, 'Instagram')
    const items = (j.children?.data?.length ? j.children.data : [j]).map(igItem).filter((x): x is NonNullable<typeof x> => !!x)
    return items.length ? { media: items, caption: j.caption ?? '', permalink: j.permalink ?? null } : null
  }
  if (!remoteId.includes('_')) {
    // Vídeo/Reels da Página (o id é o do vídeo).
    const v = await graph<{ source?: string; picture?: string; description?: string; permalink_url?: string }>(ctx, 'GET', `/${remoteId}`, { fields: 'source,picture,description,permalink_url' }, 'Página').catch(() => null)
    if (v?.source) return { media: [{ type: 'video', url: v.source }], caption: v.description ?? '', permalink: v.permalink_url ? new URL(v.permalink_url, 'https://www.facebook.com').toString() : null }
  }
  type Att = { media_type?: string; media?: { image?: { src?: string }; source?: string }; subattachments?: { data?: Att[] } }
  const j = await graph<{ message?: string; full_picture?: string; permalink_url?: string; attachments?: { data?: Att[] } }>(ctx, 'GET', `/${remoteId}`, { fields: 'message,full_picture,permalink_url,attachments{media_type,media,subattachments{media_type,media}}' }, 'Página')
  const att = j.attachments?.data?.[0]
  const list = att?.subattachments?.data?.length ? att.subattachments.data : att ? [att] : []
  const media = list.map((a) => (a.media?.source ? { type: 'video' as const, url: a.media.source } : a.media?.image?.src ? { type: 'image' as const, url: a.media.image.src } : null)).filter((x): x is NonNullable<typeof x> => !!x)
  if (!media.length && j.full_picture) media.push({ type: 'image', url: j.full_picture })
  return media.length ? { media, caption: j.message ?? '', permalink: j.permalink_url ?? null } : null
}
