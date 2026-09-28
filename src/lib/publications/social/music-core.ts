// =============================================================================
// Estúdio social — trilha sonora. PURO (testado).
// Duas fontes SEM risco de direito autoral:
//   • Biblioteca do Instagram (Audio API oficial): músicas autorizadas pela
//     Meta para uso por terceiros; só se anexam a REELS do Instagram (o
//     Instagram toca a música; o nosso vídeo vai mudo).
//   • Freesound, filtrando SÓ licença CC0 (domínio público: uso comercial
//     livre, sem atribuição): a música é embutida no próprio vídeo — serve
//     para Story, Carrossel, Post em vídeo e para o Facebook.
// "Automática" escolhe uma faixa CC0 pelo clima, variando por veículo.
// =============================================================================

export const MUSIC_MOODS = ['ANIMADA', 'ELETRONICA', 'TRANQUILA', 'CORPORATIVA', 'ROCK'] as const
export type MusicMood = (typeof MUSIC_MOODS)[number]
export const MOOD_LABEL: Record<MusicMood, string> = { ANIMADA: 'Animada', ELETRONICA: 'Eletrônica', TRANQUILA: 'Tranquila', CORPORATIVA: 'Corporativa', ROCK: 'Rock' }

export type MusicSource = 'IG' | 'FREESOUND'

/** Escolha gravada na publicação (overrides.social.music). */
export type MusicChoice =
  | { mode: 'AUTO'; mood: MusicMood }
  | { mode: 'TRACK'; source: MusicSource; id: string; title?: string; artist?: string; mood?: MusicMood }

export interface MusicTrack { source: MusicSource; id: string; title: string; artist: string; seconds: number; previewUrl: string; license: string }

export const FREESOUND_LICENSE = 'Creative Commons 0'

const QUERY: Record<MusicMood, string> = {
  ANIMADA: 'upbeat happy music',
  ELETRONICA: 'electronic beat music',
  TRANQUILA: 'chill ambient music',
  CORPORATIVA: 'corporate background music',
  ROCK: 'rock guitar music',
}

/** Parâmetros da busca no Freesound: só CC0, só música, 20 s a 4 min, melhor avaliadas. */
export function freesoundQuery(opts: { mood?: MusicMood; q?: string; pageSize?: number }): URLSearchParams {
  const q = (opts.q ?? '').trim().slice(0, 80)
  return new URLSearchParams({
    query: q || QUERY[opts.mood ?? 'ANIMADA'],
    filter: `license:"${FREESOUND_LICENSE}" duration:[20 TO 240] tag:music`,
    sort: q ? 'score' : 'rating_desc',
    fields: 'id,name,username,duration,previews,license',
    page_size: String(Math.min(Math.max(opts.pageSize ?? 20, 1), 50)),
  })
}

/** Converte a resposta do Freesound, descartando o que não for CC0 (defesa extra). */
export function parseFreesound(j: unknown): MusicTrack[] {
  const results = (j as { results?: unknown[] })?.results
  if (!Array.isArray(results)) return []
  return results.flatMap((r) => {
    const x = r as { id?: number; name?: string; username?: string; duration?: number; license?: string; previews?: Record<string, string> }
    const url = x.previews?.['preview-hq-mp3'] ?? x.previews?.['preview-lq-mp3']
    if (!x.id || !url || !/creativecommons\.org\/publicdomain\/zero|Creative Commons 0/i.test(String(x.license ?? ''))) return []
    return [{ source: 'FREESOUND' as const, id: String(x.id), title: String(x.name ?? `Faixa ${x.id}`).replace(/\.(mp3|wav|ogg|flac|aiff?)$/i, ''), artist: String(x.username ?? ''), seconds: Math.round(Number(x.duration ?? 0)), previewUrl: url, license: 'CC0 (domínio público)' }]
  })
}

/** Converte a busca da biblioteca do Instagram (GET /ig_audio?audio_type=music). */
export function parseIgAudio(j: unknown): MusicTrack[] {
  const data = (j as { data?: unknown[] })?.data
  if (!Array.isArray(data)) return []
  return data.flatMap((r) => {
    const x = r as { audio_id?: string; id?: string; title?: string; display_artist?: string; duration_in_ms?: number; download_url?: string }
    const id = x.audio_id ?? x.id
    if (!id) return []
    return [{ source: 'IG' as const, id: String(id), title: String(x.title ?? 'Música'), artist: String(x.display_artist ?? ''), seconds: Math.round(Number(x.duration_in_ms ?? 0) / 1000), previewUrl: String(x.download_url ?? ''), license: 'Biblioteca do Instagram (autorizada)' }]
  })
}

/** Faixa "automática": varia por veículo (mesmo carro = mesma faixa), sempre entre as melhores. */
export function pickTrack(tracks: MusicTrack[], seed: string): MusicTrack | null {
  const list = tracks.slice(0, 12)
  if (!list.length) return null
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return list[h % list.length]
}

/** Lê a escolha gravada; qualquer coisa inválida = sem música. */
export function musicOf(x: unknown): MusicChoice | null {
  if (!x || typeof x !== 'object') return null
  const m = x as Record<string, unknown>
  const mood = (MUSIC_MOODS as readonly string[]).includes(String(m.mood)) ? (m.mood as MusicMood) : undefined
  if (m.mode === 'AUTO') return { mode: 'AUTO', mood: mood ?? 'ANIMADA' }
  if (m.mode === 'TRACK' && (m.source === 'IG' || m.source === 'FREESOUND') && typeof m.id === 'string' && /^[\w-]{1,64}$/.test(m.id)) {
    return { mode: 'TRACK', source: m.source, id: m.id, title: typeof m.title === 'string' ? m.title.slice(0, 120) : undefined, artist: typeof m.artist === 'string' ? m.artist.slice(0, 80) : undefined, mood }
  }
  return null
}

/**
 * Como a música entra no envio:
 *   'IG_LIBRARY' → Reels do Instagram com faixa da biblioteca (anexada pela API; vídeo mudo)
 *   'EMBED'      → música CC0 embutida no vídeo (o resto)
 *   null         → sem música
 */
export function musicPlan(choice: MusicChoice | null, channel: string, format: string): 'IG_LIBRARY' | 'EMBED' | null {
  if (!choice) return null
  // Vídeo do carro mantém o áudio original.
  if (format === 'VIDEO') return null
  if (choice.mode === 'TRACK' && choice.source === 'IG') {
    // A Audio API só anexa em Reels do Instagram (o Post com música também sai como Reels).
    if (channel === 'INSTAGRAM' && (format === 'REELS' || format === 'POST')) return 'IG_LIBRARY'
    return 'EMBED' // fora disso, cai numa faixa CC0 do mesmo clima
  }
  // Carrossel no Facebook é álbum de fotos: não toca música.
  if (channel === 'META_PAGE' && format === 'CARROSSEL') return null
  return 'EMBED'
}

/** Volume e fades da trilha no vídeo (ffmpeg): entra suave e sai nos últimos 1,5 s. */
export function audioFilter(totalSeconds: number, volume = 0.85): string {
  const fadeOut = Math.max(0, totalSeconds - 1.5)
  return `volume=${volume},afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut.toFixed(2)}:d=1.5`
}
