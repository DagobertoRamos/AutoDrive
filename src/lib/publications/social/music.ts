// =============================================================================
// Estúdio social — fontes de música (servidor).
//   Freesound (CC0): chave em Master › Integrações (PUB_FREESOUND) ou env
//   FREESOUND_API_KEY. Biblioteca do Instagram: Audio API com o token da conta.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { createHttpClient, type HttpClient } from '../connectors/http'
import { graphBase } from '../connectors/meta'
import { readSecrets } from '../service'
import { freesoundQuery, musicPlan, parseFreesound, parseIgAudio, pickTrack, type MusicChoice, type MusicMood, type MusicTrack } from './music-core'

const FREESOUND = 'https://freesound.org/apiv2'
let keyCache: { v: string | null; exp: number } | null = null

export async function freesoundKey(): Promise<string | null> {
  if (keyCache && keyCache.exp > Date.now()) return keyCache.v
  let v: string | null = null
  try {
    const row = await prisma.integrationCredential.findFirst({ where: { service: 'PUB_FREESOUND', active: true }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] })
    if (row?.apiSecret) v = decrypt(row.apiSecret).trim() || null
  } catch { /* banco indisponível */ }
  v = v ?? (process.env.FREESOUND_API_KEY?.trim() || null)
  keyCache = { v, exp: Date.now() + 60_000 }
  return v
}

export async function searchFreesound(opts: { mood?: MusicMood; q?: string }, http: HttpClient = createHttpClient()): Promise<MusicTrack[]> {
  const key = await freesoundKey()
  if (!key) return []
  const res = await http.request({ url: `${FREESOUND}/search/?${freesoundQuery(opts)}`, headers: { Authorization: `Token ${key}` } })
  if (res.status >= 300) throw new Error(`Freesound respondeu ${res.status}.`)
  return parseFreesound(res.json())
}

async function freesoundTrack(id: string, http: HttpClient): Promise<MusicTrack | null> {
  const key = await freesoundKey()
  if (!key) return null
  const res = await http.request({ url: `${FREESOUND}/sounds/${encodeURIComponent(id)}/?fields=id,name,username,duration,previews,license`, headers: { Authorization: `Token ${key}` } })
  if (res.status >= 300) return null
  return parseFreesound({ results: [res.json()] })[0] ?? null
}

/** Teste do Master: busca real com a chave informada. */
export async function testFreesound(sealedKey: string | null): Promise<{ ok: boolean; message: string }> {
  const key = sealedKey ? decrypt(sealedKey).trim() : ''
  if (!key) return { ok: false, message: 'Informe a chave da API do Freesound.' }
  const res = await createHttpClient().request({ url: `${FREESOUND}/search/?${freesoundQuery({ mood: 'ANIMADA', pageSize: 5 })}`, headers: { Authorization: `Token ${key}` } })
  if (res.status === 401 || res.status === 403) return { ok: false, message: 'Chave recusada pelo Freesound.' }
  if (res.status >= 300) return { ok: false, message: `Freesound respondeu ${res.status}.` }
  keyCache = null
  const n = parseFreesound(res.json()).length
  return n ? { ok: true, message: `Freesound OK — ${n} música(s) CC0 encontradas no teste.` } : { ok: false, message: 'A chave funcionou, mas a busca não trouxe músicas CC0.' }
}

/** Biblioteca de músicas do Instagram (Audio API) com o token da conta conectada. */
export async function searchIgLibrary(tenantId: string, q: string, http: HttpClient = createHttpClient()): Promise<MusicTrack[]> {
  const conn = await prisma.publicationConnection.findFirst({ where: { tenantId, channel: 'INSTAGRAM', status: 'CONECTADO' }, orderBy: { updatedAt: 'desc' } })
  if (!conn) return []
  // A Audio API exige token de USUÁRIO (o de Página é recusado).
  const token = readSecrets(conn.secretsEncrypted).user_access_token
  if (!token) throw new Error('A biblioteca de músicas do Instagram precisa de uma nova conexão: em Canais conectados › Facebook — Página › Conectar, cole de novo o token (de usuário do sistema ou de usuário). Enquanto isso, use as músicas livres')
  const params = new URLSearchParams({ audio_type: 'music', user_id: conn.externalAccountId, access_token: token, ...(q.trim() ? { search_query: q.trim().slice(0, 80) } : {}) })
  const res = await http.request({ url: `${graphBase()}/ig_audio?${params}` })
  if (res.status >= 300) {
    const msg = res.json<{ error?: { message?: string } }>()?.error?.message
    throw new Error(`Biblioteca do Instagram indisponível${msg ? `: ${msg}` : ''}.`)
  }
  const tracks = parseIgAudio(res.json())
  if (!tracks.length) throw new Error(q.trim() ? `O Instagram não encontrou músicas para "${q.trim()}". Tente outra palavra (em inglês funciona melhor) ou use as músicas livres.` : 'O Instagram não liberou músicas da biblioteca para esta conta pela API. Busque por uma palavra (ex.: pop, funk) ou use as músicas livres.')
  return tracks
}

/** Diagnóstico da biblioteca do Instagram (Master/gestor): tipo do token, permissões e resposta crua — nunca o token. */
export async function diagIgLibrary(tenantId: string): Promise<Record<string, unknown>> {
  const conn = await prisma.publicationConnection.findFirst({ where: { tenantId, channel: 'INSTAGRAM', status: 'CONECTADO' }, orderBy: { updatedAt: 'desc' } })
  if (!conn) return { erro: 'sem conexão do Instagram' }
  const s = readSecrets(conn.secretsEncrypted)
  const token = s.user_access_token
  const out: Record<string, unknown> = { conta: conn.label, igUserId: conn.externalAccountId, temTokenUsuario: !!token, chaves: Object.keys(s) }
  if (!token) return out
  const hide = (t: string) => t.split(token).join('***').slice(0, 800)
  const get = async (path: string, params: Record<string, string>) => {
    const r = await fetch(`${graphBase()}${path}?${new URLSearchParams({ ...params, access_token: token })}`, { signal: AbortSignal.timeout(15_000) })
    return { status: r.status, body: hide(await r.text()) }
  }
  out.debugToken = await get('/debug_token', { input_token: token })
  out.me = await get('/me', { fields: 'id,name' })
  // Token da Página (publicar/apagar posts): tipo, validade e o que consegue ler.
  const page = await prisma.publicationConnection.findFirst({ where: { tenantId, channel: 'META_PAGE' }, orderBy: { updatedAt: 'desc' } })
  const ps = page ? readSecrets(page.secretsEncrypted) : {}
  if (page && ps.page_access_token) {
    const pt = ps.page_access_token
    const getP = async (path: string, params: Record<string, string>) => {
      const r = await fetch(`${graphBase()}${path}?${new URLSearchParams({ ...params, access_token: pt })}`, { signal: AbortSignal.timeout(15_000) })
      return { status: r.status, body: (await r.text()).split(pt).join('***').split(token).join('***').slice(0, 600) }
    }
    out.pagina = { id: page.externalAccountId, status: page.status }
    out.pageDebug = await getP('/debug_token', { input_token: pt })
    out.pageInfo = await getP(`/${page.externalAccountId}`, { fields: 'id,name' })
    out.pageFeed = await getP(`/${page.externalAccountId}/feed`, { limit: '1', fields: 'id,created_time' })
    out.userAccounts = await get('/me/accounts', { fields: 'id,name,tasks' })
    out.pageRoles = await getP(`/${page.externalAccountId}`, { fields: 'id,name,tasks,business,access_token' }).then((r) => ({ ...r, body: r.body.replace(/"access_token":"[^"]*"/, '"access_token":"***"') }))
    out.pagePublished = await getP(`/${page.externalAccountId}/published_posts`, { limit: '1', fields: 'id' })
  }
  for (const [k, p] of [['music', { audio_type: 'music' }], ['musicPop', { audio_type: 'music', search_query: 'pop' }], ['originalSound', { audio_type: 'original_sound' }]] as const) out[k] = await get('/ig_audio', { ...p, user_id: conn.externalAccountId })
  return out
}

/**
 * Áudio para EMBUTIR no vídeo (sempre CC0). Faixa do Instagram escolhida para
 * um formato que não aceita a biblioteca vira uma faixa CC0 do mesmo clima.
 */
/** Faixa CC0 que vai embutida no vídeo (a mesma escolha na prévia e no envio). */
export async function embedTrack(choice: MusicChoice, seed: string, http: HttpClient = createHttpClient()): Promise<MusicTrack> {
  if (!(await freesoundKey())) throw new Error('músicas livres (Freesound) não configuradas em Master › Integrações')
  let track: MusicTrack | null = null
  if (choice.mode === 'TRACK' && choice.source === 'FREESOUND') track = await freesoundTrack(choice.id, http)
  // Clima escolhido; sem resultado, qualquer música CC0 bem avaliada.
  if (!track) track = pickTrack(await searchFreesound({ mood: choice.mood ?? 'ANIMADA' }, http), seed)
  if (!track) track = pickTrack(await searchFreesound({ q: 'music' }, http), seed)
  if (!track) throw new Error('o Freesound não devolveu nenhuma música CC0 para o clima escolhido')
  return track
}

/** Música para OUVIR na pré-visualização (a mesma que vai no post). */
export async function previewAudio(choice: MusicChoice | null, channel: string, format: string, seed: string): Promise<{ url: string; title: string; artist: string } | null> {
  const plan = musicPlan(choice, channel, format)
  if (!plan || !choice) return null
  if (plan === 'IG_LIBRARY') return choice.mode === 'TRACK' && choice.previewUrl ? { url: choice.previewUrl, title: choice.title ?? 'Faixa do Instagram', artist: choice.artist ?? '' } : null
  try { const t = await embedTrack(choice, seed); return { url: t.previewUrl, title: t.title, artist: t.artist } } catch { return null }
}

export async function audioToEmbed(choice: MusicChoice, seed: string, http: HttpClient = createHttpClient()): Promise<{ bytes: Buffer; track: MusicTrack }> {
  const track = await embedTrack(choice, seed, http)
  // Prévia em alta; se falhar, a de baixa.
  const urls = [track.previewUrl, track.previewUrl.replace('-hq.mp3', '-lq.mp3')].filter((u, i, a) => a.indexOf(u) === i)
  let last = ''
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { 'User-Agent': 'AutoDrive/1.0 (+https://www.appautodrive.com.br)' } })
      if (!res.ok) { last = `HTTP ${res.status}`; continue }
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length < 1000) { last = 'arquivo vazio'; continue }
      if (bytes.length > 15_000_000) { last = 'arquivo grande demais'; continue }
      return { bytes, track }
    } catch (e) { last = (e as Error).message }
  }
  throw new Error(`não foi possível baixar a música "${track.title}" (${last})`)
}
