// =============================================================================
// Conector: TikTok — Content Posting API (Direct Post) no perfil da loja.
// Fontes (lidas em 02/10/2026): developers.tiktok.com/doc/
//   content-posting-api-reference-direct-post, ...-photo-post,
//   ...-get-video-status, content-posting-api-media-transfer-guide e Login Kit.
//   criador:  POST /v2/post/publish/creator_info/query/ (privacidades aceitas)
//   vídeo:    POST /v2/post/publish/video/init/ (FILE_UPLOAD) → PUT upload_url
//             em pedaços (Content-Range). Arquivo vai direto: não depende de
//             o TikTok baixar o nosso link (PULL_FROM_URL exige domínio verificado).
//   fotos:    POST /v2/post/publish/content/init/ (media_type PHOTO, só
//             PULL_FROM_URL → prefixo de URL do AutoDrive verificado no app).
//   status:   POST /v2/post/publish/status/fetch/ (PUBLISH_COMPLETE / FAILED).
// Sem Story, sem edição e sem exclusão pela API: venda = pendência manual.
// App NÃO auditado só publica como privado (SELF_ONLY): publicamos privado e
// avisamos, para a loja testar antes da auditoria.
// Token de acesso vale 24 h; renovação (365 dias) feita aqui antes de chamar.
// =============================================================================

import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import { channelText, type ListingPayload } from '../content-core'
import { getPlatformApp } from '../platform-apps'
import { musicPlan } from '../social/music-core'
import type { SocialSpec } from '../social/formats'
import type { HttpResponse } from './http'
import type { Connector, ConnectorContext, RemoteRef, RemoteResult } from './types'

const spec = channelSpec('TIKTOK')!
export const TIKTOK_API = 'https://open.tiktokapis.com'
export const TIKTOK_AUTH = 'https://www.tiktok.com/v2/auth/authorize/'
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish']
const REFRESH_BEFORE_MS = 10 * 60_000

const MB = 1024 * 1024
const MAX_CHUNK = 64 * MB
const PART = 10 * MB

/**
 * Pedaços do envio (guia de transferência): abaixo de 5 MB vai inteiro; até
 * 64 MB, um pedaço só; acima, pedaços de 10 MB e o último leva o resto
 * (total = tamanho ÷ pedaço, arredondado para baixo). PURO.
 */
export function chunkPlan(size: number): { chunkSize: number; count: number; ranges: Array<[number, number]> } {
  if (size <= 0) throw new ConnectorError('VALIDATION', 'Vídeo vazio.')
  const chunkSize = size <= MAX_CHUNK ? size : PART
  const count = size <= MAX_CHUNK ? 1 : Math.floor(size / PART)
  const ranges: Array<[number, number]> = []
  for (let i = 0; i < count; i++) ranges.push([i * chunkSize, i === count - 1 ? size - 1 : (i + 1) * chunkSize - 1])
  return { chunkSize, count, ranges }
}

type TtError = { code?: string; message?: string; log_id?: string }

/** Erro do TikTok (error.code) → erro tipado. */
export function tiktokError(res: HttpResponse, what: string): ConnectorError | null {
  const e = res.json<{ error?: TtError }>()?.error
  const code = e?.code
  if (res.status >= 200 && res.status < 300 && (!code || code === 'ok')) return null
  const msg = `${what}: ${e?.message || code || `HTTP ${res.status}`}`.slice(0, 400)
  const opts = { code: code ?? String(res.status) }
  switch (code) {
    case 'access_token_invalid': case 'scope_not_authorized': case 'scope_permission_missed':
      return new ConnectorError('AUTH', msg, 'Reconecte o TikTok em Canais conectados (acesso vencido ou permissão de publicar removida).', opts)
    case 'rate_limit_exceeded':
      return new ConnectorError('RATE_LIMIT', msg, undefined, { ...opts, retryAfterMs: 60_000 })
    case 'spam_risk_too_many_posts': case 'spam_risk_too_many_pending_share': case 'reached_active_user_cap':
      return new ConnectorError('QUOTA', msg, 'Limite diário de posts do TikTok atingido. Tente amanhã.', opts)
    case 'spam_risk_user_banned_from_posting':
      return new ConnectorError('CONFIG', msg, 'O TikTok bloqueou publicações desta conta. Verifique o aplicativo do TikTok.', opts)
    case 'url_ownership_unverified':
      return new ConnectorError('CONFIG', msg, 'O endereço das fotos do AutoDrive precisa estar verificado no app TikTok (Content Posting API › Verify URL prefix). Vídeos (Reels/Vídeo do carro) não dependem disso.', opts)
    case 'unaudited_client_can_only_post_to_private_accounts':
      return new ConnectorError('VALIDATION', msg, 'App ainda não auditado pelo TikTok: só publica como privado.', opts)
    case 'privacy_level_option_mismatch':
      return new ConnectorError('VALIDATION', msg, 'A privacidade escolhida não é aceita por esta conta do TikTok.', opts)
    case 'invalid_publish_id':
      return new ConnectorError('NOT_FOUND', msg, undefined, opts)
  }
  if (res.status === 401) return new ConnectorError('AUTH', msg, 'Reconecte o TikTok em Canais conectados.', opts)
  if (res.status === 429) return new ConnectorError('RATE_LIMIT', msg, undefined, { ...opts, retryAfterMs: 60_000 })
  if (res.status >= 500 || code === 'internal_error') return new ConnectorError('UNAVAILABLE', msg, undefined, opts)
  return new ConnectorError('VALIDATION', msg, undefined, opts)
}

/** Garante token de acesso válido (renova pelo refresh_token e grava cifrado). */
export async function ensureTikTokToken(ctx: ConnectorContext, force = false): Promise<string> {
  const exp = Number(ctx.secrets.expires_at ?? 0)
  if (!force && ctx.secrets.access_token && exp - ctx.now().getTime() > REFRESH_BEFORE_MS) return ctx.secrets.access_token
  if (!ctx.secrets.refresh_token) throw new ConnectorError('AUTH', 'Autorização do TikTok ausente.', 'Conecte a conta em Canais conectados.')
  const app = await getPlatformApp('TIKTOK', ctx.connection.tenantId)
  if (!app) throw new ConnectorError('CONFIG', 'App do TikTok não configurado na plataforma.', 'O MASTER cadastra em Master › Integrações (Publicações — TikTok).')
  const res = await ctx.http.request({
    method: 'POST', url: `${TIKTOK_API}/v2/oauth/token/`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: app.clientId, client_secret: app.clientSecret, grant_type: 'refresh_token', refresh_token: ctx.secrets.refresh_token }),
  })
  const j = res.json<{ access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; error?: string; error_description?: string }>()
  if (!j?.access_token) {
    if (res.status >= 500) throw new ConnectorError('UNAVAILABLE', `TikTok (token): HTTP ${res.status}`)
    throw new ConnectorError('AUTH', `A autorização do TikTok foi revogada ou expirou${j?.error_description ? ` (${j.error_description})` : ''}.`, 'Reconecte a conta em Canais conectados.', { code: j?.error ?? 'invalid_grant' })
  }
  const now = ctx.now().getTime()
  const refreshExp = new Date(now + (j.refresh_expires_in ?? 31_536_000) * 1000)
  const next = { ...ctx.secrets, access_token: j.access_token, refresh_token: j.refresh_token ?? ctx.secrets.refresh_token, expires_at: String(now + (j.expires_in ?? 86_400) * 1000) }
  Object.assign(ctx.secrets, next)
  // O vencimento que importa para "reconectar" é o da renovação (365 dias), não o do acesso (24 h).
  await ctx.saveSecrets(next, refreshExp)
  return j.access_token
}

export async function tt<T>(ctx: ConnectorContext, path: string, body: unknown, what: string, creates = false): Promise<T> {
  const call = async (tok: string) => ctx.http.request({ method: 'POST', url: `${TIKTOK_API}${path}`, creates, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body ?? {}) })
  let res = await call(await ensureTikTokToken(ctx))
  if (res.status === 401) res = await call(await ensureTikTokToken(ctx, true))
  const err = tiktokError(res, what)
  if (err) throw err
  // Ids de post são inteiros de 64 bits: viram texto antes do JSON.parse (senão perdem precisão).
  const safe = res.text.replace(/("publicaly_available_post_id"\s*:\s*\[)([^\]]*)\]/g, (_m, head: string, list: string) => `${head}${list.split(',').map((t) => (/^\s*\d+\s*$/.test(t) ? `"${t.trim()}"` : t)).join(',')}]`)
  try { return (JSON.parse(safe) as { data?: T }).data ?? ({} as T) } catch { return {} as T }
}

export interface CreatorInfo { creator_username?: string; creator_nickname?: string; privacy_level_options?: string[]; max_video_post_duration_sec?: number; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean }

export const creatorInfo = (ctx: ConnectorContext) => tt<CreatorInfo>(ctx, '/v2/post/publish/creator_info/query/', {}, 'TikTok (conta)')

/** Privacidade: a escolhida na conexão (config.privacyLevel) ou pública, se a conta aceitar. PURO. */
export function pickPrivacy(options: string[] | undefined, wanted?: unknown): string {
  const opts = options?.length ? options : ['PUBLIC_TO_EVERYONE']
  if (typeof wanted === 'string' && opts.includes(wanted)) return wanted
  return opts.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : opts[0]
}

const isUnaudited = (e: unknown) => e instanceof ConnectorError && e.code === 'unaudited_client_can_only_post_to_private_accounts'

/**
 * Cria o post; se o app ainda não foi auditado pelo TikTok, repete como
 * PRIVADO (SELF_ONLY) e devolve `privateOnly` para avisar a loja.
 */
async function initWithPrivacy(ctx: ConnectorContext, privacy: string, init: (privacy: string) => Promise<{ publish_id: string; upload_url?: string }>): Promise<{ publish_id: string; upload_url?: string; privateOnly: boolean }> {
  try { return { ...(await init(privacy)), privateOnly: privacy === 'SELF_ONLY' } } catch (e) {
    if (!isUnaudited(e) || privacy === 'SELF_ONLY') throw e
    return { ...(await init('SELF_ONLY')), privateOnly: true }
  }
}

/** Envia o vídeo (arquivo) e devolve o publish_id para conferência. */
export async function tiktokVideo(ctx: ConnectorContext, bytes: Uint8Array, caption: string, privacy: string): Promise<{ publishId: string; privateOnly: boolean }> {
  const plan = chunkPlan(bytes.length)
  const r = await initWithPrivacy(ctx, privacy, (pl) => tt<{ publish_id: string; upload_url: string }>(ctx, '/v2/post/publish/video/init/', {
    post_info: { title: caption.slice(0, 2200), privacy_level: pl, disable_comment: false, disable_duet: false, disable_stitch: false, video_cover_timestamp_ms: 1000 },
    source_info: { source: 'FILE_UPLOAD', video_size: bytes.length, chunk_size: plan.chunkSize, total_chunk_count: plan.count },
  }, 'TikTok (vídeo)', true))
  if (!r.upload_url) throw new ConnectorError('UNAVAILABLE', 'O TikTok não devolveu o endereço de envio do vídeo.')
  for (const [a, b] of plan.ranges) {
    const up = await ctx.http.request({ method: 'PUT', url: r.upload_url, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(b - a + 1), 'Content-Range': `bytes ${a}-${b}/${bytes.length}` }, body: bytes.subarray(a, b + 1), timeoutMs: 180_000 })
    if (up.status < 200 || up.status >= 300) throw tiktokError(up, 'TikTok (envio do vídeo)') ?? new ConnectorError('UNAVAILABLE', `TikTok (envio do vídeo): HTTP ${up.status}`)
  }
  return { publishId: r.publish_id, privateOnly: r.privateOnly }
}

/** Post em modo foto (o TikTok baixa as imagens pelos links). */
export async function tiktokPhotos(ctx: ConnectorContext, urls: string[], title: string, description: string, privacy: string, autoMusic: boolean): Promise<{ publishId: string; privateOnly: boolean }> {
  if (!urls.length) throw new ConnectorError('VALIDATION', 'Sem fotos para o TikTok.')
  const r = await initWithPrivacy(ctx, privacy, (pl) => tt<{ publish_id: string }>(ctx, '/v2/post/publish/content/init/', {
    media_type: 'PHOTO', post_mode: 'DIRECT_POST',
    post_info: { title: title.slice(0, 90), description: description.slice(0, 4000), privacy_level: pl, disable_comment: false, auto_add_music: autoMusic },
    source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: urls.slice(0, spec.media.max) },
  }, 'TikTok (fotos)', true))
  return { publishId: r.publish_id, privateOnly: r.privateOnly }
}

export interface TikTokStatus { status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }

export const tiktokStatus = (ctx: ConnectorContext, publishId: string) => tt<TikTokStatus>(ctx, '/v2/post/publish/status/fetch/', { publish_id: publishId }, 'TikTok (status)')

const FAIL_TEXT: Record<string, string> = {
  file_format_check_failed: 'formato do arquivo não aceito',
  duration_check_failed: 'duração do vídeo fora do permitido',
  frame_rate_check_failed: 'taxa de quadros não aceita',
  picture_size_check_failed: 'tamanho da imagem não aceito (máx. 1080p)',
  spam_risk_too_many_posts: 'limite diário de posts atingido',
  auth_removed: 'a loja removeu a autorização do AutoDrive no TikTok',
  video_pull_failed: 'o TikTok não conseguiu baixar o vídeo',
  photo_pull_failed: 'o TikTok não conseguiu baixar as fotos (prefixo de URL verificado?)',
}

/** Link do post: com id público vira o link do vídeo/foto; senão, o perfil. PURO. */
export function tiktokUrl(username: string | undefined, postId: string | null, photo: boolean): string | null {
  const u = username?.replace(/^@/, '')
  if (!u) return null
  return postId ? `https://www.tiktok.com/@${u}/${photo ? 'photo' : 'video'}/${postId}` : `https://www.tiktok.com/@${u}`
}

/** Estado do envio (publish_id) → resultado comum. PURO. */
export function tiktokResult(st: TikTokStatus, publishId: string, username: string | undefined, photo: boolean, privateOnly: boolean): RemoteResult {
  const s = st.status
  if (s === 'FAILED') {
    const r = st.fail_reason ?? ''
    return { state: 'REJEITADO', pendingToken: null, remoteStatus: 'recusado', message: `O TikTok recusou o post${r ? `: ${FAIL_TEXT[r] ?? r}` : ''}.` }
  }
  if (s === 'PUBLISH_COMPLETE') {
    const id = st.publicaly_available_post_id?.[0] != null ? String(st.publicaly_available_post_id[0]) : null
    return {
      state: 'PUBLICADO', remoteId: id ?? publishId, pendingToken: null, remoteUrl: tiktokUrl(username, id, photo),
      remoteStatus: privateOnly ? 'publicado como PRIVADO' : id ? 'no ar' : 'publicado (em moderação)',
      message: privateOnly ? 'Publicado como PRIVADO: o app ainda não foi auditado pelo TikTok. Depois da auditoria, os posts saem públicos.' : null,
    }
  }
  return { state: 'EM_ANALISE', pendingToken: publishId, remoteStatus: s === 'PROCESSING_DOWNLOAD' ? 'TikTok baixando as fotos' : 'TikTok processando' }
}

function needStudio(ctx: ConnectorContext, s: SocialSpec) {
  if (!ctx.social) throw new ConnectorError('CONFIG', `O formato ${s.format.toLowerCase()} precisa do estúdio de artes, indisponível nesta execução.`)
  return ctx.social
}

/** Fotos do post: com formato social, a 1ª vira a arte (Post = só a arte). */
function photoUrls(p: ListingPayload, ctx: ConnectorContext): string[] {
  const photos = p.photos.slice(0, spec.media.max)
  const s = p.social
  if (!s || !ctx.social || !photos.length) return photos.map((u) => ctx.mediaUrl(u))
  const art = ctx.social.artUrl(photos[0], p, s.format === 'CARROSSEL' ? 'CARROSSEL' : 'POST', s.template)
  return s.format === 'POST' ? [art] : [art, ...photos.slice(1).map((u) => ctx.mediaUrl(u))]
}

/** O ref guarda "foto" e "privado" no pendingToken: `<publish_id>|f|p`. */
const packToken = (id: string, photo: boolean, priv: boolean) => `${id}|${photo ? 'f' : 'v'}|${priv ? 'p' : ''}`
const unpackToken = (t: string) => { const [id, kind, priv] = t.split('|'); return { id, photo: kind === 'f', priv: priv === 'p' } }

export const tiktokConnector: Connector = {
  spec,
  async testConnection(ctx) {
    const c = await creatorInfo(ctx)
    const name = c.creator_username ? `@${c.creator_username}` : c.creator_nickname ?? ctx.connection.externalAccountId
    return { ok: true, message: `Conta autorizada. Privacidades aceitas: ${(c.privacy_level_options ?? []).join(', ') || '—'}.`, account: name, quota: { videoMaxSegundos: c.max_video_post_duration_sec ?? null } }
  },
  async limits(ctx) {
    const c = await creatorInfo(ctx)
    return { videoMaxSegundos: c.max_video_post_duration_sec ?? null, privacidades: c.privacy_level_options ?? [] }
  },
  async validate(p) {
    if (p.social?.format === 'STORY') return [{ field: 'format', severity: 'error', message: 'O TikTok não tem Story pela API oficial.', hint: 'Use Post, Carrossel, Reels ou Vídeo do carro para o TikTok.' }]
    return []
  },
  async publish(p, ctx) {
    const s = p.social
    if (s?.format === 'STORY') throw new ConnectorError('VALIDATION', 'O TikTok não tem Story pela API oficial.', 'Use Post, Carrossel, Reels ou Vídeo do carro.', { code: 'VALIDACAO_LOCAL' })
    const creator = await creatorInfo(ctx)
    const privacy = pickPrivacy(creator.privacy_level_options, ctx.connection.config.privacyLevel)
    const caption = channelText(p, spec).description
    const music = s ? musicPlan(s.music ?? null, 'TIKTOK', s.format) : null
    let sent: { publishId: string; privateOnly: boolean }
    let photo = false
    if (s?.format === 'VIDEO') sent = await tiktokVideo(ctx, await needStudio(ctx, s).carVideo(p), caption, privacy)
    else if (s && (s.format === 'REELS' || (s.format === 'POST' && music))) {
      // Reels = vídeo com as fotos; Post com música sai como vídeo curto da arte.
      const { bytes } = await needStudio(ctx, s).video(p, s.format === 'REELS' ? 'REELS' : 'CLIP', { format: s.format, template: s.template, embedMusic: !!music })
      sent = await tiktokVideo(ctx, bytes, caption, privacy)
    } else {
      photo = true
      sent = await tiktokPhotos(ctx, photoUrls(p, ctx), p.title, caption, privacy, !!s?.music)
    }
    return {
      state: 'EM_ANALISE', pendingToken: packToken(sent.publishId, photo, sent.privateOnly),
      message: `${photo ? 'Fotos enviadas' : 'Vídeo enviado'}; o TikTok está processando.${sent.privateOnly ? ' Sai como PRIVADO até o app ser auditado pelo TikTok.' : ''}`,
    }
  },
  async get(ref: RemoteRef, ctx) {
    if (ref.pendingToken) {
      const t = unpackToken(ref.pendingToken)
      try {
        const r = tiktokResult(await tiktokStatus(ctx, t.id), t.id, ctx.secrets.username, t.photo, t.priv)
        return r.state === 'EM_ANALISE' ? { ...r, pendingToken: ref.pendingToken } : r
      } catch (e) {
        if (e instanceof ConnectorError && e.kind === 'NOT_FOUND') return { state: 'NAO_ENCONTRADO', pendingToken: null }
        throw e
      }
    }
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    // A API de publicação não consulta post já publicado: vale o que foi confirmado.
    return { state: 'PUBLICADO', remoteId: ref.remoteId, remoteUrl: ref.remoteUrl ?? tiktokUrl(ctx.secrets.username, null, false), remoteStatus: 'publicado' }
  },
  // update/pause/resume/remove: não oferecidos pela API → pendência manual (worker).
}
