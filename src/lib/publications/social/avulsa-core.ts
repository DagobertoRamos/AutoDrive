// =============================================================================
// Posts avulsos (fotos/vídeos da loja) — regras. PURO (testado).
//   Post: 1 a 10 fotos (2+ = carrossel no Instagram / álbum no Facebook).
//   Story: 1 foto ou 1 vídeo.   Reels: 1 vídeo.
//   Link: link de vídeo (YouTube, Vimeo, TikTok…) como post da Página do
//   Facebook com cartão do vídeo. O Instagram não publica link (regra da rede)
//   e vídeo do YouTube/TikTok não é baixado (termos dos serviços).
// Vídeo: enviado em pedaços (até 120 MB) ou por link (Drive, Dropbox, .mp4).
// =============================================================================

import { classifyVideo } from './video-core'

export const AVULSA_FORMATS = ['POST', 'STORY', 'REELS', 'LINK'] as const
export type AvulsaFormat = (typeof AVULSA_FORMATS)[number]
export const AVULSA_LABEL: Record<AvulsaFormat, string> = { POST: 'Post / Carrossel (fotos)', STORY: 'Story (foto ou vídeo)', REELS: 'Reels (vídeo)', LINK: 'Link de vídeo (YouTube, Vimeo, TikTok)' }
/** Formato que só a Página do Facebook aceita. */
export const FACEBOOK_ONLY: AvulsaFormat[] = ['LINK']

/** Redes que aceitam o formato: TikTok publica fotos (modo foto) e vídeo, sem Story e sem link. */
export function avulsaChannels(format: AvulsaFormat): string[] {
  if (FACEBOOK_ONLY.includes(format)) return ['META_PAGE']
  if (format === 'STORY') return ['INSTAGRAM', 'META_PAGE']
  return ['INSTAGRAM', 'META_PAGE', 'TIKTOK']
}
export const avulsaAccepts = (channel: string, format: AvulsaFormat) => avulsaChannels(format).includes(channel)

/**
 * Identidade da loja aplicada na mídia.
 *   ASSINATURA: logo + @ pequenos e limpos (no vídeo, fora da imagem quando
 *               sobra espaço) + encerramento de 2,5 s com o logo — padrão de agência.
 *   DISCRETO:   só o logo no canto.   COMPLETO: logo + faixa com nome e WhatsApp.
 */
export type BrandMark = 'ASSINATURA' | 'DISCRETO' | 'COMPLETO'
export const isBrandMark = (x: unknown): x is BrandMark => x === 'ASSINATURA' || x === 'DISCRETO' || x === 'COMPLETO'

export type AvulsaMedia =
  | { type: 'image'; assetId: string; branded?: BrandMark }
  | { type: 'video'; uploadId: string; parts: number; size: number; name?: string; posterAssetId?: string; brand?: BrandMark }
  | { type: 'video'; link: string; brand?: BrandMark }
  /** Vídeo enviado direto do celular para o armazenamento de arquivos (fora do banco). */
  | { type: 'video'; blobUrl: string; size: number; name?: string; posterAssetId?: string; brand?: BrandMark }
  | { type: 'link'; url: string }

export const PART_BYTES = 3_500_000
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024
/** Vídeo no armazenamento de arquivos: até 300 MB. */
export const MAX_BLOB_VIDEO_BYTES = 300 * 1024 * 1024

/** Endereço de vídeo no armazenamento (Vercel Blob), sempre na pasta avulsa/<loja>/. */
export const BLOB_VIDEO_URL = /^https:\/\/[a-z0-9]+\.(?:public|private)\.blob\.vercel-storage\.com\/avulsa\/[a-z0-9]{10,40}\/[\w.%-]{1,200}$/i
/** Pasta da loja no armazenamento. */
export const blobFolder = (tenantId: string) => `avulsa/${tenantId}/`
export const blobBelongsTo = (url: string, tenantId: string) => BLOB_VIDEO_URL.test(url) && new URL(url).pathname.startsWith(`/${blobFolder(tenantId)}`)

const ID = /^[a-z0-9]{10,40}$/i
const UP = /^[a-zA-Z0-9-]{8,64}$/

export function sanitizeMedia(x: unknown): AvulsaMedia[] {
  if (!Array.isArray(x)) return []
  return x.slice(0, 10).flatMap((m): AvulsaMedia[] => {
    const o = (m ?? {}) as Record<string, unknown>
    if (o.type === 'image' && typeof o.assetId === 'string' && ID.test(o.assetId)) return [{ type: 'image', assetId: o.assetId, ...(isBrandMark(o.branded) ? { branded: o.branded } : {}) }]
    if (o.type === 'video' && typeof o.uploadId === 'string' && UP.test(o.uploadId)) {
      const parts = Number(o.parts); const size = Number(o.size)
      if (Number.isInteger(parts) && parts >= 1 && parts <= Math.ceil(MAX_VIDEO_BYTES / PART_BYTES) && size > 0 && size <= MAX_VIDEO_BYTES) {
        return [{ type: 'video', uploadId: o.uploadId, parts, size, name: typeof o.name === 'string' ? o.name.slice(0, 120) : undefined, ...(typeof o.posterAssetId === 'string' && ID.test(o.posterAssetId) ? { posterAssetId: o.posterAssetId } : {}), ...(isBrandMark(o.brand) ? { brand: o.brand } : {}) }]
      }
    }
    if (o.type === 'video' && typeof o.blobUrl === 'string' && BLOB_VIDEO_URL.test(o.blobUrl)) {
      const size = Number(o.size)
      if (size > 0 && size <= MAX_BLOB_VIDEO_BYTES) return [{ type: 'video', blobUrl: o.blobUrl, size, name: typeof o.name === 'string' ? o.name.slice(0, 120) : undefined, ...(typeof o.posterAssetId === 'string' && ID.test(o.posterAssetId) ? { posterAssetId: o.posterAssetId } : {}), ...(isBrandMark(o.brand) ? { brand: o.brand } : {}) }]
    }
    if (o.type === 'link' && typeof o.url === 'string') {
      const v = classifyVideo(o.url)
      if (v) return [{ type: 'link', url: v.url }]
    }
    if (o.type === 'video' && typeof o.link === 'string') {
      const v = classifyVideo(o.link)
      if (v?.downloadUrl) return [{ type: 'video', link: v.url, ...(isBrandMark(o.brand) ? { brand: o.brand } : {}) }]
    }
    return []
  })
}

/** Confere se as mídias servem para o formato. Devolve a mensagem de erro ou null. */
export function validateAvulsa(format: AvulsaFormat, media: AvulsaMedia[], caption: string): string | null {
  const imgs = media.filter((m) => m.type === 'image').length
  const vids = media.filter((m) => m.type === 'video').length
  const links = media.filter((m) => m.type === 'link').length
  if (format === 'LINK') return links === 1 && media.length === 1 ? (caption.length > 5000 ? 'Texto longo demais.' : null) : 'Cole 1 link de vídeo (YouTube, Vimeo, TikTok…).'
  if (links) return 'Link de vídeo tem formato próprio: escolha "Link de vídeo".'
  if (format === 'POST') {
    if (vids) return 'Post leva só fotos. Para vídeo, escolha Reels ou Story.'
    if (!imgs) return 'Envie ao menos uma foto.'
    if (imgs > 10) return 'Até 10 fotos por post.'
  }
  if (format === 'STORY' && media.length !== 1) return 'Story leva 1 foto ou 1 vídeo.'
  if (format === 'REELS' && (vids !== 1 || imgs)) return 'Reels leva 1 vídeo.'
  if (caption.length > 2200) return 'Legenda com mais de 2.200 caracteres (limite do Instagram).'
  return null
}

export type AvulsaStatus = 'RASCUNHO' | 'AGENDADO' | 'ENVIANDO' | 'PUBLICADO' | 'PARCIAL' | 'FALHA' | 'CANCELADO'
export interface AvulsaResult { state: 'PUBLICADO' | 'EM_ANALISE' | 'FALHA'; remoteId?: string | null; remoteUrl?: string | null; pendingToken?: string | null; video?: boolean; error?: string | null; at?: string }

/**
 * Legenda pronta para a rede: tira a marcação de texto do ChatGPT/Markdown
 * (**negrito**, __sublinhado__, # títulos), que o Instagram/Facebook mostram
 * como asteriscos e cerquilhas soltos. Hashtags (#carros) ficam.
 */
export function plainCaption(t: string): string {
  return String(t ?? '')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1').replace(/__([\s\S]+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n').trim()
}

/** Situação geral a partir do resultado de cada conta. */
export function overallStatus(connectionIds: string[], results: Record<string, AvulsaResult>): AvulsaStatus {
  const r = connectionIds.map((c) => results[c])
  if (r.some((x) => !x || x.state === 'EM_ANALISE')) return 'ENVIANDO'
  const ok = r.filter((x) => x.state === 'PUBLICADO').length
  return ok === r.length ? 'PUBLICADO' : ok ? 'PARCIAL' : 'FALHA'
}
