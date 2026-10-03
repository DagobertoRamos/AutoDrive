// =============================================================================
// Posts avulsos (fotos/vídeos da loja) — serviço. Criação, envio de vídeo em
// pedaços, e a publicação pela rotina agendada (cada conta com seu resultado;
// vídeo fica "processando" até a rede terminar, e a rotina seguinte publica).
// =============================================================================

import { writeFile, appendFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ConnectorError, isConnectorError } from '../errors'
import { graph, graphBase, graphError, rupload, waitContainer } from '../connectors/meta'
import type { ConnectorContext } from '../connectors/types'
import { creatorInfo, pickPrivacy, tiktokPhotos, tiktokResult, tiktokStatus, tiktokVideo } from '../connectors/tiktok'
import { socialName } from '../channels'
import { mediaUrlFor, videoUrlFor } from '../media-token'
import { connectorContext, type WorkerDeps } from '../worker'
import { avulsaChannels, blobBelongsTo, FACEBOOK_ONLY, overallStatus, plainCaption, sanitizeMedia, validateAvulsa, type AvulsaFormat, type AvulsaMedia, type AvulsaResult, type BrandMark } from './avulsa-core'
import { downloadToFile, downloadVideoLink, probeVideo, toReels, type ReelsExtras } from './video'

export const VIDEO_PART_KIND = 'SOCIAL_VPART'
const partKey = (uploadId: string, index: number) => `${uploadId}:${index}`

/** Guarda um pedaço do vídeo enviado pelo navegador. */
export async function storeVideoPart(tenantId: string, uploadId: string, index: number, bytes: Uint8Array): Promise<void> {
  const key = partKey(uploadId, index)
  await prisma.siteAsset.deleteMany({ where: { tenantId, kind: VIDEO_PART_KIND, sha256: key } })
  await prisma.siteAsset.create({ data: { tenantId, kind: VIDEO_PART_KIND, mimeType: 'application/octet-stream', fileSize: bytes.length, sha256: key, data: new Uint8Array(bytes) } })
}

async function partsReady(tenantId: string, m: Extract<AvulsaMedia, { uploadId: string }>): Promise<boolean> {
  const n = await prisma.siteAsset.count({ where: { tenantId, kind: VIDEO_PART_KIND, sha256: { in: Array.from({ length: m.parts }, (_, i) => partKey(m.uploadId, i)) } } })
  return n === m.parts
}

/** Junta os pedaços num arquivo e ajusta para vertical 9:16 (Reels/Story). */
async function assembleVideo(tenantId: string, m: Extract<AvulsaMedia, { type: 'video' }>): Promise<Uint8Array> {
  const dir = await mkdtemp(path.join(tmpdir(), 'avulsa-'))
  try {
    const src = path.join(dir, 'in'); const out = path.join(dir, 'out.mp4')
    if ('link' in m) await downloadVideoLink(m.link, src)
    else if ('blobUrl' in m) await blobToFile(m.blobUrl, src).catch((e) => { throw new ConnectorError('VALIDATION', `O vídeo não está mais no armazenamento (${(e as Error).message}). Envie de novo.`) })
    else {
      await writeFile(src, new Uint8Array())
      for (let i = 0; i < m.parts; i++) {
        const rows = await prisma.$queryRaw<{ b64: string }[]>`SELECT encode(data, 'base64') AS b64 FROM site_assets WHERE "tenantId" = ${tenantId} AND kind = ${VIDEO_PART_KIND} AND sha256 = ${partKey(m.uploadId, i)} LIMIT 1`
        if (!rows[0]) throw new ConnectorError('VALIDATION', 'O vídeo não foi enviado por completo. Envie de novo.')
        await appendFile(src, Buffer.from(rows[0].b64, 'base64'))
      }
    }
    // Identidade da loja (quando marcada no post): a ASSINATURA usa as faixas
    // livres ao redor da imagem e fecha com o encerramento de 2,5 s.
    const extras: ReelsExtras = {}
    if (m.brand) {
      const { brandEndCard, brandOverlay, fitBox, tenantBrand } = await import('./brand-frame')
      const brand = await tenantBrand(tenantId)
      const info = await probeVideo(src)
      extras.overlay = path.join(dir, 'marca.png')
      await writeFile(extras.overlay, await brandOverlay(1080, 1920, brand, m.brand, info ? fitBox(info.width, info.height) : undefined))
      if (m.brand === 'ASSINATURA' && info?.duration) {
        extras.endCard = path.join(dir, 'fim.png'); extras.duration = info.duration
        await writeFile(extras.endCard, await brandEndCard(brand))
      }
    }
    await toReels(src, out, undefined, extras)
    return new Uint8Array(await readFile(out))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ── Identidade da loja ───────────────────────────────────────────────────────

/**
 * Fotos: gera a versão com a identidade da loja (nova imagem guardada; a
 * original fica). Vídeos: marca para aplicar ao montar o vídeo na publicação.
 */
async function applyBrand(tenantId: string, media: AvulsaMedia[], style: BrandMark): Promise<AvulsaMedia[]> {
  const { brandPhoto, tenantBrand } = await import('./brand-frame')
  const brand = await tenantBrand(tenantId)
  const out: AvulsaMedia[] = []
  for (const m of media) {
    if (m.type === 'image' && !m.branded) {
      const a = await prisma.siteAsset.findFirst({ where: { id: m.assetId, tenantId, kind: 'SOCIAL_UPLOAD' }, select: { data: true } })
      if (!a) { out.push(m); continue }
      const jpg = await brandPhoto(Buffer.from(a.data), brand, style)
      const meta = await (await import('sharp')).default(jpg).metadata()
      const b = await prisma.siteAsset.create({ data: { tenantId, kind: 'SOCIAL_UPLOAD', mimeType: 'image/jpeg', fileSize: jpg.length, width: meta.width ?? null, height: meta.height ?? null, sha256: createHash('sha256').update(jpg).digest('hex'), data: new Uint8Array(jpg) }, select: { id: true } })
      out.push({ type: 'image', assetId: b.id, branded: style })
    } else if (m.type === 'video') out.push({ ...m, brand: style })
    else out.push(m)
  }
  return out
}

// ── Criação ──────────────────────────────────────────────────────────────────

export interface AvulsaInput { /** Aplicar a identidade da loja nas fotos e vídeos. */ brand?: BrandMark | null; id?: string; title?: string; format: AvulsaFormat; caption: string; media: unknown; connectionIds: string[]; scheduledAt: Date | null; draft: boolean }

export async function createAvulsa(tenantId: string, i: AvulsaInput, actor: { id: string | null; name: string | null }) {
  let media = sanitizeMedia(i.media)
  if (i.brand) media = await applyBrand(tenantId, media, i.brand)
  const err = validateAvulsa(i.format, media, i.caption)
  if (err) throw new Error(err)
  const channels = avulsaChannels(i.format)
  const conns = await prisma.publicationConnection.findMany({ where: { tenantId, id: { in: i.connectionIds }, channel: { in: channels } }, select: { id: true } })
  if (!conns.length) throw new Error(FACEBOOK_ONLY.includes(i.format) ? 'Link só pode ser publicado na Página do Facebook (o Instagram não aceita links em posts).' : i.format === 'STORY' ? 'Story vai para o Instagram ou o Facebook (o TikTok não tem Story pela API).' : 'Escolha ao menos uma conta do Instagram, do Facebook ou do TikTok.')
  const imgs = media.flatMap((m) => (m.type === 'image' ? [m.assetId] : m.type === 'video' && 'posterAssetId' in m && m.posterAssetId ? [m.posterAssetId] : []))
  if (imgs.length && (await prisma.siteAsset.count({ where: { tenantId, id: { in: imgs }, kind: 'SOCIAL_UPLOAD' } })) !== imgs.length) throw new Error('Alguma foto não foi encontrada. Envie de novo.')
  for (const m of media) if (m.type === 'video' && 'uploadId' in m && !(await partsReady(tenantId, m))) throw new Error('O vídeo ainda não terminou de subir. Aguarde e tente de novo.')
  for (const m of media) if (m.type === 'video' && 'blobUrl' in m && !blobBelongsTo(m.blobUrl, tenantId)) throw new Error('Vídeo inválido. Envie de novo.')
  const data = {
    title: i.title?.trim().slice(0, 120) || null, format: i.format, caption: i.caption.trim() || null, media: media as unknown as object, connectionIds: conns.map((c) => c.id),
    status: i.draft ? 'RASCUNHO' : 'AGENDADO', scheduledAt: i.draft ? i.scheduledAt : i.scheduledAt ?? new Date(),
  } as const
  if (i.id) {
    // Continuando um rascunho: atualiza o mesmo registro (e solta vídeos que saíram).
    const old = await prisma.socialPost.findFirst({ where: { id: i.id, tenantId, status: 'RASCUNHO' }, select: { media: true } })
    if (!old) throw new Error('Este rascunho não existe mais (rascunhos são apagados após 2 dias). Salve de novo.')
    const keep = new Set(media.flatMap((m) => ('uploadId' in m ? [m.uploadId] : 'blobUrl' in m ? [m.blobUrl] : [])))
    await deleteVideoParts(tenantId, sanitizeMedia(old.media).filter((m) => ('uploadId' in m && !keep.has(m.uploadId)) || ('blobUrl' in m && !keep.has(m.blobUrl))))
    return prisma.socialPost.update({ where: { id: i.id }, data })
  }
  return prisma.socialPost.create({ data: { tenantId, ...data, createdById: actor.id, createdByName: actor.name } })
}

// ── Publicação ───────────────────────────────────────────────────────────────

async function igResumable(ctx: ConnectorContext, params: Record<string, string>, bytes: Uint8Array, what: string, videoUrl?: () => Promise<string>): Promise<string> {
  const c = await graph<{ id: string }>(ctx, 'POST', `/${ctx.connection.externalAccountId}/media`, { ...params, upload_type: 'resumable' }, what)
  const up = await ctx.http.request({ method: 'POST', url: `https://rupload.facebook.com/ig-api-upload/${graphBase().split('/').pop()}/${c.id}`, headers: { Authorization: `OAuth ${ctx.secrets.page_access_token}`, offset: '0', file_size: String(bytes.length), 'Content-Type': 'application/octet-stream' }, body: bytes, timeoutMs: 180_000 })
  if (up.status >= 200 && up.status < 300) return c.id
  // O envio do arquivo devolve o motivo em debug_info (não em error) — antes só aparecia "HTTP 400".
  const dbg = up.json<{ debug_info?: { message?: string; type?: string } }>()?.debug_info
  const err = graphError(up, dbg?.message ? `${what} (envio): ${dbg.message}${dbg.type ? ` (${dbg.type})` : ''}` : `${what} (envio)`) ?? new ConnectorError('UNAVAILABLE', `${what}: HTTP ${up.status}`)
  // Recusa do envio direto: o Instagram baixa o mesmo vídeo pelo nosso link.
  if (videoUrl && up.status >= 400 && up.status < 500) {
    try {
      const alt = await graph<{ id: string }>(ctx, 'POST', `/${ctx.connection.externalAccountId}/media`, { ...params, video_url: await videoUrl() }, `${what} (link)`)
      return alt.id
    } catch (e) {
      throw new ConnectorError(err.kind, `${err.message} · alternativa por link: ${(e as Error).message}`.slice(0, 400), err.hint, err.opts)
    }
  }
  throw err
}

async function igPublish(ctx: ConnectorContext, creation: string): Promise<AvulsaResult> {
  const media = await graph<{ id: string }>(ctx, 'POST', `/${ctx.connection.externalAccountId}/media_publish`, { creation_id: creation }, 'Instagram (publicar)', true)
  const j = await graph<{ permalink?: string }>(ctx, 'GET', `/${media.id}`, { fields: 'permalink' }, 'Instagram').catch(() => ({ permalink: undefined }))
  return { state: 'PUBLICADO', remoteId: media.id, remoteUrl: j.permalink ?? null }
}

interface Prepared { images: string[]; link: string | null; video: () => Promise<Uint8Array>; /** Link público (assinado) do mesmo vídeo pronto — envio alternativo. */ videoUrl?: () => Promise<string> }

async function publishTo(channel: string, ctx: ConnectorContext, format: AvulsaFormat, caption: string, m: Prepared): Promise<AvulsaResult> {
  const acc = ctx.connection.externalAccountId
  if (channel === 'TIKTOK') {
    if (format !== 'POST' && format !== 'REELS') throw new ConnectorError('VALIDATION', 'O TikTok aceita só fotos (Post) e vídeo (Reels).')
    const creator = await creatorInfo(ctx)
    const privacy = pickPrivacy(creator.privacy_level_options, ctx.connection.config.privacyLevel)
    const photo = format === 'POST'
    const sent = photo
      ? await tiktokPhotos(ctx, m.images, caption.split('\n')[0] ?? '', caption, privacy, true)
      : await tiktokVideo(ctx, await m.video(), caption, privacy)
    return { state: 'EM_ANALISE', pendingToken: `${sent.publishId}|${photo ? 'f' : 'v'}|${sent.privateOnly ? 'p' : ''}` }
  }
  if (channel === 'INSTAGRAM') {
    if (format === 'POST') {
      if (m.images.length === 1) {
        const c = (await graph<{ id: string }>(ctx, 'POST', `/${acc}/media`, { image_url: m.images[0], caption }, 'Instagram (foto)')).id
        await waitContainer(ctx, c); return igPublish(ctx, c)
      }
      const kids: string[] = []
      for (const u of m.images) kids.push((await graph<{ id: string }>(ctx, 'POST', `/${acc}/media`, { image_url: u, is_carousel_item: 'true' }, 'Instagram (item)')).id)
      for (const k of kids) await waitContainer(ctx, k)
      const c = (await graph<{ id: string }>(ctx, 'POST', `/${acc}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption }, 'Instagram (carrossel)')).id
      await waitContainer(ctx, c); return igPublish(ctx, c)
    }
    if (format === 'STORY' && m.images.length) {
      const c = (await graph<{ id: string }>(ctx, 'POST', `/${acc}/media`, { image_url: m.images[0], media_type: 'STORIES' }, 'Instagram (story)')).id
      await waitContainer(ctx, c); return igPublish(ctx, c)
    }
    const bytes = await m.video()
    const c = await igResumable(ctx, format === 'STORY' ? { media_type: 'STORIES' } : { media_type: 'REELS', caption, share_to_feed: 'true' }, bytes, format === 'STORY' ? 'Instagram (story em vídeo)' : 'Instagram (Reels)', m.videoUrl)
    return { state: 'EM_ANALISE', pendingToken: c }
  }
  // Página do Facebook
  if (format === 'LINK') {
    if (!m.link) throw new ConnectorError('VALIDATION', 'Sem link de vídeo.')
    const post = await graph<{ id: string }>(ctx, 'POST', `/${acc}/feed`, { message: caption, link: m.link }, 'Post com link', true)
    const j = await graph<{ permalink_url?: string }>(ctx, 'GET', `/${post.id}`, { fields: 'permalink_url' }, 'Post').catch(() => ({ permalink_url: undefined }))
    return { state: 'PUBLICADO', remoteId: post.id, remoteUrl: j.permalink_url ?? null }
  }
  if (format === 'POST') {
    const ids: string[] = []
    for (const u of m.images) ids.push((await graph<{ id: string }>(ctx, 'POST', `/${acc}/photos`, { url: u, published: 'false' }, 'Foto')).id)
    const params: Record<string, string> = { message: caption }
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }) })
    const post = await graph<{ id: string }>(ctx, 'POST', `/${acc}/feed`, params, 'Post', true)
    const j = await graph<{ permalink_url?: string }>(ctx, 'GET', `/${post.id}`, { fields: 'permalink_url' }, 'Post').catch(() => ({ permalink_url: undefined }))
    return { state: 'PUBLICADO', remoteId: post.id, remoteUrl: j.permalink_url ?? null }
  }
  if (format === 'STORY' && m.images.length) {
    const photo = await graph<{ id: string }>(ctx, 'POST', `/${acc}/photos`, { url: m.images[0], published: 'false' }, 'Story (foto)')
    const st = await graph<{ post_id?: string }>(ctx, 'POST', `/${acc}/photo_stories`, { photo_id: photo.id }, 'Story', true)
    return { state: 'PUBLICADO', remoteId: st.post_id ?? photo.id }
  }
  const bytes = await m.video()
  const edge = format === 'STORY' ? 'video_stories' : 'video_reels'
  const start = await graph<{ video_id: string }>(ctx, 'POST', `/${acc}/${edge}`, { upload_phase: 'start' }, `${format === 'STORY' ? 'Story em vídeo' : 'Reels'} (início)`)
  await rupload(ctx, start.video_id, bytes, `${format === 'STORY' ? 'Story em vídeo' : 'Reels'} (envio)`)
  const fin = await graph<{ post_id?: string }>(ctx, 'POST', `/${acc}/${edge}`, format === 'STORY' ? { upload_phase: 'finish', video_id: start.video_id } : { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: caption }, format === 'STORY' ? 'Story em vídeo' : 'Reels (publicar)', true)
  return format === 'STORY' ? { state: 'PUBLICADO', remoteId: fin.post_id ?? start.video_id } : { state: 'EM_ANALISE', remoteId: start.video_id, video: true }
}

/** Vídeo em processamento: confere e publica (Instagram) ou confirma (Facebook). */
async function checkPending(channel: string, ctx: ConnectorContext, r: AvulsaResult): Promise<AvulsaResult> {
  if (channel === 'TIKTOK' && r.pendingToken) {
    const [id, kind, priv] = r.pendingToken.split('|')
    const x = tiktokResult(await tiktokStatus(ctx, id), id, ctx.secrets.username, kind === 'f', priv === 'p')
    if (x.state === 'REJEITADO') return { state: 'FALHA', error: x.message ?? 'O TikTok recusou o post.' }
    if (x.state !== 'PUBLICADO') return r
    return { state: 'PUBLICADO', remoteId: x.remoteId ?? id, remoteUrl: x.remoteUrl ?? null, ...(x.message ? { error: x.message } : {}) }
  }
  if (channel === 'INSTAGRAM' && r.pendingToken) {
    const st = await graph<{ status_code?: string; status?: string }>(ctx, 'GET', `/${r.pendingToken}`, { fields: 'status_code,status' }, 'Instagram (processamento)')
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') return { state: 'FALHA', error: `O Instagram recusou o vídeo (${st.status ?? st.status_code}).` }
    if (st.status_code !== 'FINISHED') return r
    return igPublish(ctx, r.pendingToken)
  }
  if (channel === 'META_PAGE' && r.remoteId) {
    const v = await graph<{ permalink_url?: string; status?: { video_status?: string } }>(ctx, 'GET', `/${r.remoteId}`, { fields: 'permalink_url,status' }, 'Vídeo')
    const s = v.status?.video_status
    if (s === 'error') return { state: 'FALHA', remoteId: r.remoteId, error: 'O Facebook não conseguiu processar o vídeo.' }
    if (s === 'ready' || s === 'published') return { state: 'PUBLICADO', remoteId: r.remoteId, remoteUrl: v.permalink_url ? (v.permalink_url.startsWith('http') ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : null }
    return r
  }
  return r
}

const TRANSIENT = new Set(['RATE_LIMIT', 'UNAVAILABLE', 'TIMEOUT'])

/** Rotina agendada: publica os avulsos vencidos e confere os que estão processando. */
export async function processSocialPosts(deps: WorkerDeps = {}, now = new Date()): Promise<{ processed: number }> {
  const due = await prisma.socialPost.findMany({
    where: { status: { in: ['AGENDADO', 'ENVIANDO'] }, scheduledAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    orderBy: { scheduledAt: 'asc' }, take: 5,
  })
  let processed = 0
  for (const post of due) {
    const lock = await prisma.socialPost.updateMany({ where: { id: post.id, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: new Date(now.getTime() + 5 * 60_000) } })
    if (!lock.count) continue
    processed++
    const connIds = (post.connectionIds as string[]) ?? []
    const results = { ...((post.results as Record<string, AvulsaResult> | null) ?? {}) }
    const media = sanitizeMedia(post.media)
    const origin = (deps.origin ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
    let videoCache: Promise<Uint8Array> | null = null
    let videoUrlCache: Promise<string> | null = null
    const prepared: Prepared = {
      images: media.flatMap((m) => (m.type === 'image' ? [mediaUrlFor(origin, post.tenantId, `/api/site/assets/${m.assetId}`, { now })] : [])),
      link: media.find((m) => m.type === 'link')?.type === 'link' ? (media.find((m) => m.type === 'link') as { url: string }).url : null,
      video: () => (videoCache ??= (async () => { const v = media.find((m) => m.type === 'video'); if (!v || v.type !== 'video') throw new ConnectorError('VALIDATION', 'Sem vídeo.'); return assembleVideo(post.tenantId, v) })()),
      videoUrl: () => (videoUrlCache ??= (async () => {
        const mp4 = await prepared.video()
        const a = await prisma.siteAsset.create({ data: { tenantId: post.tenantId, kind: 'SOCIAL_VIDEO', mimeType: 'video/mp4', fileSize: mp4.length, width: 1080, height: 1920, sha256: createHash('sha256').update(mp4).digest('hex'), data: new Uint8Array(mp4) }, select: { id: true } })
        return videoUrlFor(origin, post.tenantId, a.id, { now })
      })()),
    }
    let lastError: string | null = null
    let transient = false
    const conns = await prisma.publicationConnection.findMany({ where: { tenantId: post.tenantId, id: { in: connIds } } })
    for (const id of connIds) {
      const prev = results[id]
      if (prev?.state === 'PUBLICADO' || prev?.state === 'FALHA') continue
      const conn = conns.find((c) => c.id === id)
      if (!conn || conn.status !== 'CONECTADO') { results[id] = { state: 'FALHA', error: 'Conta desconectada: reconecte em Canais conectados.', at: now.toISOString() }; continue }
      try {
        const ctx = await connectorContext(conn, deps)
        results[id] = { ...(prev?.state === 'EM_ANALISE' ? await checkPending(conn.channel, ctx, prev) : await publishTo(conn.channel, ctx, post.format as AvulsaFormat, plainCaption(post.caption ?? ''), prepared)), at: now.toISOString() }
      } catch (e) {
        const ce = isConnectorError(e) ? e : null
        lastError = `${socialName(conn.channel)}: ${(e as Error).message}`
        if (ce && TRANSIENT.has(ce.kind) && post.attempts < 3) transient = true
        else results[id] = { state: 'FALHA', error: (e as Error).message.slice(0, 400), at: now.toISOString() }
      }
    }
    const pendingOrRetry = transient || connIds.some((c) => results[c]?.state === 'EM_ANALISE')
    const status = transient ? 'ENVIANDO' : overallStatus(connIds, results)
    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        results: results as unknown as object, status, lastError, lockedUntil: null, attempts: { increment: transient ? 1 : 0 },
        // Processando/tentando de novo: volta em 1 minuto (a rotina roda a cada minuto).
        ...(pendingOrRetry ? { scheduledAt: new Date(now.getTime() + 60_000) } : {}),
        ...(status === 'PUBLICADO' || status === 'PARCIAL' ? { publishedAt: now } : {}),
      },
    })
    // Publicado em todas as redes: o vídeo não serve mais. Com falha, fica
    // guardado para "Tentar de novo" e "Baixar" (limpeza após KEEP_FAILED_DAYS).
    if (!pendingOrRetry && status === 'PUBLICADO') await deleteVideoParts(post.tenantId, media)
  }
  return { processed }
}

/** Dias que o vídeo de um post com falha fica guardado para reenviar/baixar. */
export const KEEP_FAILED_DAYS = 7
/** Posts cujo vídeo ainda é necessário: pendentes ou com falha recente. */
const KEEP_VIDEO_WHERE = () => ({
  OR: [
    { status: { in: ['RASCUNHO', 'AGENDADO', 'ENVIANDO'] } },
    { status: { in: ['FALHA', 'PARCIAL'] }, updatedAt: { gte: new Date(Date.now() - KEEP_FAILED_DAYS * 86_400_000) } },
  ],
})

/** O vídeo do post ainda está guardado? (pedaços completos ou arquivo no armazenamento) */
export async function videoAvailable(tenantId: string, media: AvulsaMedia[]): Promise<boolean> {
  for (const m of media) {
    if (m.type !== 'video') continue
    if ('uploadId' in m && !(await partsReady(tenantId, m))) return false
    if ('blobUrl' in m) {
      if (!/\.private\.blob\./.test(m.blobUrl)) continue
      try {
        const r = await (await import('@vercel/blob')).head(m.blobUrl, (await import('./blob-token')).blobAuth())
        if (!r) return false
      } catch { return false }
    }
  }
  return true
}

/**
 * "Tentar de novo": volta para a fila só as redes que falharam (o que já foi
 * publicado não é reenviado). Exige que a mídia ainda esteja guardada.
 */
export async function retryAvulsa(tenantId: string, id: string): Promise<{ ok: true; channels: number } | { ok: false; error: string }> {
  const post = await prisma.socialPost.findFirst({ where: { id, tenantId } })
  if (!post) return { ok: false, error: 'Post não encontrado.' }
  if (!['FALHA', 'PARCIAL'].includes(post.status)) return { ok: false, error: 'Só posts com falha podem ser reenviados.' }
  const results = { ...((post.results as Record<string, AvulsaResult> | null) ?? {}) }
  const failed = Object.keys(results).filter((k) => results[k]?.state === 'FALHA')
  if (!failed.length) return { ok: false, error: 'Nenhuma rede com falha neste post.' }
  if (!(await videoAvailable(tenantId, sanitizeMedia(post.media)))) return { ok: false, error: 'O vídeo deste post não está mais guardado. Envie o vídeo de novo em Post avulso.' }
  for (const k of failed) delete results[k]
  await prisma.socialPost.update({
    where: { id },
    data: { status: 'AGENDADO', scheduledAt: new Date(), attempts: 0, lockedUntil: null, lastError: null, results: results as unknown as object },
  })
  return { ok: true, channels: failed.length }
}

/** Arquivo original de uma mídia do post (para baixar e postar fora). */
export async function avulsaMediaFile(tenantId: string, media: AvulsaMedia): Promise<{ bytes: Uint8Array; mime: string; ext: string } | { redirect: string } | null> {
  if (media.type === 'image') {
    const a = await prisma.siteAsset.findFirst({ where: { id: media.assetId, tenantId }, select: { data: true, mimeType: true } })
    return a ? { bytes: new Uint8Array(a.data), mime: a.mimeType ?? 'image/jpeg', ext: (a.mimeType ?? '').includes('png') ? 'png' : 'jpg' } : null
  }
  if (media.type === 'link') return { redirect: media.url }
  if ('link' in media) return { redirect: media.link }
  const dir = await mkdtemp(path.join(tmpdir(), 'avulsa-dl-'))
  try {
    const src = path.join(dir, 'video')
    if ('blobUrl' in media) await blobToFile(media.blobUrl, src)
    else {
      if (!(await partsReady(tenantId, media))) return null
      await writeFile(src, new Uint8Array())
      for (let i = 0; i < media.parts; i++) {
        const rows = await prisma.$queryRaw<{ b64: string }[]>`SELECT encode(data, 'base64') AS b64 FROM site_assets WHERE "tenantId" = ${tenantId} AND kind = ${VIDEO_PART_KIND} AND sha256 = ${partKey(media.uploadId, i)} LIMIT 1`
        if (!rows[0]) return null
        await appendFile(src, Buffer.from(rows[0].b64, 'base64'))
      }
    }
    const name = ('name' in media && media.name) || ''
    const ext = (/\.([a-z0-9]{2,4})$/i.exec(name)?.[1] ?? 'mp4').toLowerCase()
    return { bytes: new Uint8Array(await readFile(src)), mime: ext === 'mov' ? 'video/quicktime' : 'video/mp4', ext }
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Apaga os pedaços de vídeo de um post (publicado, com erro ou cancelado). */
export async function deleteVideoParts(tenantId: string, media: AvulsaMedia[]): Promise<void> {
  for (const m of media) {
    if (m.type === 'video' && 'uploadId' in m) await prisma.siteAsset.deleteMany({ where: { tenantId, kind: VIDEO_PART_KIND, sha256: { startsWith: `${m.uploadId}:` } } }).catch(() => undefined)
    // Vídeo no armazenamento: apagado depois de publicado/cancelado.
    if (m.type === 'video' && 'blobUrl' in m && blobBelongsTo(m.blobUrl, tenantId)) await deleteBlob(m.blobUrl)
  }
}

/**
 * Limpeza do espaço (rotina de 15 min): fotos enviadas que nenhum post usa
 * (1 dia) e fotos/capas de posts encerrados há mais de 30 dias.
 */
export async function pruneSocialUploads(now = new Date()): Promise<number> {
  const uploads = await prisma.siteAsset.findMany({ where: { kind: 'SOCIAL_UPLOAD', createdAt: { lt: new Date(now.getTime() - 86_400_000) } }, select: { id: true }, take: 1000 })
  if (!uploads.length) return 0
  const posts = await prisma.socialPost.findMany({ where: { media: { not: undefined } }, select: { status: true, updatedAt: true, media: true } })
  const keep = new Set<string>()
  const limit = now.getTime() - 30 * 86_400_000
  for (const p of posts) {
    const final = ['PUBLICADO', 'PARCIAL', 'FALHA', 'CANCELADO'].includes(p.status)
    if (final && p.updatedAt.getTime() < limit) continue
    for (const m of sanitizeMedia(p.media)) {
      if (m.type === 'image') keep.add(m.assetId)
      if (m.type === 'video' && 'posterAssetId' in m && m.posterAssetId) keep.add(m.posterAssetId)
    }
  }
  const ids = uploads.map((u) => u.id).filter((id) => !keep.has(id))
  return ids.length ? (await prisma.siteAsset.deleteMany({ where: { id: { in: ids } } })).count : 0
}

/** Espaço usado pela Central de Publicações da loja (bytes por tipo). */
export async function socialStorage(tenantId: string): Promise<{ fotos: number; pedacosVideo: number; videosGerados: number; total: number }> {
  const rows = await prisma.siteAsset.groupBy({ by: ['kind'], where: { tenantId, kind: { in: ['SOCIAL_UPLOAD', VIDEO_PART_KIND, 'SOCIAL_VIDEO'] } }, _sum: { fileSize: true } })
  const get = (k: string) => rows.find((r) => r.kind === k)?._sum.fileSize ?? 0
  const fotos = get('SOCIAL_UPLOAD'); const pedacosVideo = get(VIDEO_PART_KIND); const videosGerados = get('SOCIAL_VIDEO')
  return { fotos, pedacosVideo, videosGerados, total: fotos + pedacosVideo + videosGerados }
}

/** Baixa o vídeo do armazenamento (público por link; privado com a chave). */
async function blobToFile(url: string, file: string): Promise<void> {
  if (!/\.private\.blob\./.test(url)) return downloadToFile(url, file)
  const r = await (await import('@vercel/blob')).get(url, { access: 'private', ...(await import('./blob-token')).blobAuth() })
  if (!r || r.statusCode !== 200) throw new Error('arquivo não encontrado')
  const { Readable } = await import('node:stream')
  const { pipeline } = await import('node:stream/promises')
  const { createWriteStream } = await import('node:fs')
  await pipeline(Readable.fromWeb(r.stream as unknown as import('node:stream/web').ReadableStream), createWriteStream(file))
}

async function deleteBlob(url: string): Promise<void> {
  const bt = await import('./blob-token')
  if (!bt.blobMode()) return
  try { await (await import('@vercel/blob')).del(url, bt.blobAuth()) } catch (e) { console.error('[avulsa] apagar vídeo do armazenamento', (e as Error).message) }
}

/** Vídeos no armazenamento com mais de 3 dias que nenhum post pendente usa (envio abandonado). */
export async function pruneVideoBlobs(now = new Date()): Promise<number> {
  const bt = await import('./blob-token')
  if (!bt.blobMode()) return 0
  const auth = bt.blobAuth()
  const { list, del } = await import('@vercel/blob')
  const active = await prisma.socialPost.findMany({ where: KEEP_VIDEO_WHERE(), select: { media: true } })
  const keep = new Set(active.flatMap((p) => sanitizeMedia(p.media).flatMap((m) => (m.type === 'video' && 'blobUrl' in m ? [m.blobUrl] : []))))
  const old: string[] = []
  let cursor: string | undefined
  do {
    const r = await list({ prefix: 'avulsa/', cursor, limit: 1000, ...auth })
    for (const b of r.blobs) if (b.uploadedAt.getTime() < now.getTime() - 3 * 86_400_000 && !keep.has(b.url)) old.push(b.url)
    cursor = r.hasMore ? r.cursor : undefined
  } while (cursor && old.length < 1000)
  if (old.length) await del(old, auth)
  return old.length
}

/** Pedaços de vídeo com mais de 3 dias que não pertencem a post ainda pendente (rascunho, agendado, enviando). */
export async function pruneVideoParts(): Promise<number> {
  const old = await prisma.siteAsset.findMany({ where: { kind: VIDEO_PART_KIND, createdAt: { lt: new Date(Date.now() - 3 * 86_400_000) } }, select: { id: true, sha256: true }, take: 500 })
  if (!old.length) return 0
  const active = await prisma.socialPost.findMany({ where: KEEP_VIDEO_WHERE(), select: { media: true } })
  const keep = new Set(active.flatMap((p) => sanitizeMedia(p.media).flatMap((m) => (m.type === 'video' && 'uploadId' in m ? [m.uploadId] : []))))
  const ids = old.filter((a) => !keep.has(a.sha256.split(':')[0])).map((a) => a.id)
  if (!ids.length) return 0
  return (await prisma.siteAsset.deleteMany({ where: { id: { in: ids } } })).count
}
