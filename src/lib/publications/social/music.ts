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
import { freesoundQuery, parseFreesound, parseIgAudio, pickTrack, type MusicChoice, type MusicMood, type MusicTrack } from './music-core'

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
  const token = readSecrets(conn.secretsEncrypted).page_access_token
  if (!token) return []
  const params = new URLSearchParams({ audio_type: 'music', user_id: conn.externalAccountId, access_token: token, ...(q.trim() ? { search_query: q.trim().slice(0, 80) } : {}) })
  const res = await http.request({ url: `${graphBase()}/ig_audio?${params}` })
  if (res.status >= 300) {
    const msg = res.json<{ error?: { message?: string } }>()?.error?.message
    throw new Error(`Biblioteca do Instagram indisponível${msg ? `: ${msg}` : ''}.`)
  }
  return parseIgAudio(res.json())
}

/**
 * Áudio para EMBUTIR no vídeo (sempre CC0). Faixa do Instagram escolhida para
 * um formato que não aceita a biblioteca vira uma faixa CC0 do mesmo clima.
 */
export async function audioToEmbed(choice: MusicChoice, seed: string, http: HttpClient = createHttpClient()): Promise<{ bytes: Buffer; track: MusicTrack }> {
  if (!(await freesoundKey())) throw new Error('músicas livres (Freesound) não configuradas em Master › Integrações')
  let track: MusicTrack | null = null
  if (choice.mode === 'TRACK' && choice.source === 'FREESOUND') track = await freesoundTrack(choice.id, http)
  // Clima escolhido; sem resultado, qualquer música CC0 bem avaliada.
  if (!track) track = pickTrack(await searchFreesound({ mood: choice.mood ?? 'ANIMADA' }, http), seed)
  if (!track) track = pickTrack(await searchFreesound({ q: 'music' }, http), seed)
  if (!track) throw new Error('o Freesound não devolveu nenhuma música CC0 para o clima escolhido')
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
