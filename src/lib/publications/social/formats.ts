// =============================================================================
// Estúdio social — formatos (Post, Carrossel, Story, Reels) e modelos de arte
// para Instagram e Facebook. PURO (testado).
//   • Cada formato vira UMA publicação própria do veículo no canal (o
//     campaignKey é o formato), com fila, agendamento e calendário comuns.
//   • Arte = foto do carro inteira (nunca recortada) sobre fundo desfocado +
//     faixa com modelo, ano/km, preço e contato, nas cores da loja.
// =============================================================================

import { musicOf, type MusicChoice } from './music-core'
import { isDesignStyle, isVideoSeconds, type DesignStyle, type VideoSeconds } from './design-styles'

export const SOCIAL_FORMATS = ['POST', 'CARROSSEL', 'STORY', 'REELS', 'VIDEO'] as const
export type SocialFormat = (typeof SOCIAL_FORMATS)[number]

export const ART_TEMPLATES = ['OFERTA', 'CHEGOU', 'DESTAQUE', 'LIMPA'] as const
export type ArtTemplate = (typeof ART_TEMPLATES)[number]

export interface SocialSpec {
  format: SocialFormat; template: ArtTemplate; music?: MusicChoice | null
  /** Modelo visual (12 estilos) da arte e do vídeo; sem ele, a arte clássica. */
  design?: DesignStyle
  /** Duração do Reels em segundos (30 padrão, 40, 50, 60). */
  seconds?: VideoSeconds
}

export const FORMAT_INFO: Record<SocialFormat, { label: string; hint: string; canvas: 'FEED' | 'VERTICAL' }> = {
  POST: { label: 'Post', hint: 'Arte com preço no feed (4:5).', canvas: 'FEED' },
  CARROSSEL: { label: 'Carrossel', hint: 'Arte de capa + até 9 fotos para deslizar.', canvas: 'FEED' },
  STORY: { label: 'Story', hint: 'Arte vertical que some em 24 h.', canvas: 'VERTICAL' },
  REELS: { label: 'Reels', hint: 'Vídeo vertical com as fotos, preço e contato.', canvas: 'VERTICAL' },
  VIDEO: { label: 'Vídeo do carro', hint: 'O vídeo gravado do carro (Drive, Dropbox ou .mp4) como Reels.', canvas: 'VERTICAL' },
}

export const TEMPLATE_INFO: Record<ArtTemplate, { label: string; badge: string | null }> = {
  OFERTA: { label: 'Oferta', badge: 'OFERTA' },
  CHEGOU: { label: 'Acabou de chegar', badge: 'ACABOU DE CHEGAR' },
  DESTAQUE: { label: 'Destaque da semana', badge: 'DESTAQUE DA SEMANA' },
  LIMPA: { label: 'Só a foto e o preço', badge: null },
}

/** Tamanho em pixels. Reels em 720p: arquivo leve (a rede converte) e renderização rápida. */
export function canvasSize(format: SocialFormat, forVideo = false): { w: number; h: number } {
  if (FORMAT_INFO[format].canvas === 'FEED') return { w: 1080, h: 1350 }
  return forVideo ? { w: 720, h: 1280 } : { w: 1080, h: 1920 }
}

export const isSocialFormat = (x: unknown): x is SocialFormat => typeof x === 'string' && (SOCIAL_FORMATS as readonly string[]).includes(x)
export const isArtTemplate = (x: unknown): x is ArtTemplate => typeof x === 'string' && (ART_TEMPLATES as readonly string[]).includes(x)

/** Lê o formato gravado nos ajustes da publicação (overrides.social). */
export function socialOf(overrides: unknown): SocialSpec | null {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return null
  const s = (overrides as Record<string, unknown>).social
  if (!s || typeof s !== 'object') return null
  const { format, template, music, design, seconds } = s as Record<string, unknown>
  if (!isSocialFormat(format)) return null
  const m = musicOf(music)
  return { format, template: isArtTemplate(template) ? template : 'OFERTA', ...(m ? { music: m } : {}), ...(isDesignStyle(design) ? { design } : {}), ...(isVideoSeconds(seconds) ? { seconds: Number(seconds) as VideoSeconds } : {}) }
}

/**
 * Chave da campanha (uma publicação por chave no canal). Post e Carrossel são
 * únicos por veículo (pedir de novo atualiza). Story e Reels são recorrentes:
 * a data entra na chave, então cada dia gera uma publicação nova.
 */
export function campaignKeyFor(format: SocialFormat, localDate?: string): string {
  const k = format.toLowerCase()
  if (format === 'POST' || format === 'CARROSSEL') return k
  const day = /^\d{4}-\d{2}-\d{2}/.exec(localDate ?? '')?.[0]
  return day ? `${k}-${day}` : k
}

/** Formatos que cada canal aceita pela API oficial. */
export function formatsFor(channel: string): SocialFormat[] {
  if (channel === 'INSTAGRAM' || channel === 'META_PAGE') return [...SOCIAL_FORMATS]
  // TikTok: sem Story pela API (Post/Carrossel saem no modo foto).
  if (channel === 'TIKTOK') return ['POST', 'CARROSSEL', 'REELS', 'VIDEO']
  return []
}

// ── Piloto automático ────────────────────────────────────────────────────────
// Espalha os formatos para não publicar tudo no mesmo minuto: o algoritmo
// entrega melhor posts em horários de pico e o perfil fica ativo por mais dias.

export const PEAK_HOURS = [12, 19] as const

/**
 * Horários sugeridos (hora local da loja, "HH:MM" + dias a somar) para cada
 * formato a partir do momento da aprovação. Post e Story no próximo pico;
 * Reels no pico seguinte; Carrossel dois dias depois (reforço).
 */
export function autoPlan(formats: SocialFormat[], localHour: number): Array<{ format: SocialFormat; dayOffset: number; time: string }> {
  const nextPeak = PEAK_HOURS.find((h) => h > localHour)
  const first = nextPeak != null ? { dayOffset: 0, hour: nextPeak } : { dayOffset: 1, hour: PEAK_HOURS[0] }
  const second = first.hour === PEAK_HOURS[0] ? { dayOffset: first.dayOffset, hour: PEAK_HOURS[1] } : { dayOffset: first.dayOffset + 1, hour: PEAK_HOURS[0] }
  const at = (x: { dayOffset: number; hour: number }, min = 0) => ({ dayOffset: x.dayOffset, time: `${String(x.hour).padStart(2, '0')}:${String(min).padStart(2, '0')}` })
  const plan: Record<SocialFormat, { dayOffset: number; time: string }> = {
    POST: at(first),
    STORY: at(first, 5),
    REELS: at(second),
    CARROSSEL: at({ dayOffset: first.dayOffset + 2, hour: first.hour }),
    VIDEO: at({ dayOffset: first.dayOffset + 1, hour: PEAK_HOURS[1] }),
  }
  return formats.map((format) => ({ format, ...plan[format] }))
}

/** Converte o plano em horário local "AAAA-MM-DDTHH:MM" a partir de agora (horário local da loja). */
export function planLocal(nowLocal: string, formats: SocialFormat[]): Array<{ format: SocialFormat; local: string }> {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(nowLocal)
  if (!m) return []
  const hour = Number(m[4]) + Number(m[5]) / 60
  return autoPlan(formats, hour).map((x) => {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + x.dayOffset))
    return { format: x.format, local: `${d.toISOString().slice(0, 10)}T${x.time}` }
  })
}
