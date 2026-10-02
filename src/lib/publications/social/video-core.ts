// =============================================================================
// Vídeo do carro — classificação do link. PURO (testado).
//   • Toca no site: YouTube e arquivo de vídeo (.mp4/.webm, Dropbox direto).
//   • Vira Reels (o sistema baixa e ajusta para 9:16): Google Drive, Dropbox e
//     arquivo .mp4/.mov/.webm. YouTube, Vimeo, TikTok, Instagram e Facebook
//     NÃO são baixados (os termos desses serviços proíbem): o link vai no
//     texto dos posts (clicável no Facebook) e no site.
// =============================================================================

export type VideoKind = 'YOUTUBE' | 'VIMEO' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'DRIVE' | 'DROPBOX' | 'ARQUIVO'
export interface VideoLink { kind: VideoKind; url: string; label: string; downloadUrl: string | null; siteUrl: string | null }

const LABEL: Record<VideoKind, string> = {
  YOUTUBE: 'YouTube', VIMEO: 'Vimeo', TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', DRIVE: 'Google Drive', DROPBOX: 'Dropbox', ARQUIVO: 'arquivo de vídeo',
}

/** Classifica o link (só https). Link de outro tipo = null (não aceito). */
export function classifyVideo(raw: unknown): VideoLink | null {
  const s = String(raw ?? '').trim()
  if (!/^https:\/\/[^\s]+$/i.test(s) || s.length > 600) return null
  let u: URL
  try { u = new URL(s) } catch { return null }
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '')
  const mk = (kind: VideoKind, downloadUrl: string | null, siteUrl: string | null): VideoLink => ({ kind, url: s, label: LABEL[kind], downloadUrl, siteUrl })
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return /(watch\?v=|shorts\/|embed\/|youtu\.be\/)[\w-]{6,}/i.test(s) ? mk('YOUTUBE', null, s) : null
  if (host.endsWith('vimeo.com')) return mk('VIMEO', null, null)
  if (host.endsWith('tiktok.com')) return mk('TIKTOK', null, null)
  if (host.endsWith('instagram.com')) return mk('INSTAGRAM', null, null)
  if (host.endsWith('facebook.com') || host === 'fb.watch') return mk('FACEBOOK', null, null)
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const id = /\/file\/d\/([\w-]{10,})/.exec(u.pathname)?.[1] ?? u.searchParams.get('id')
    return id && /^[\w-]{10,}$/.test(id) ? mk('DRIVE', `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, null) : null
  }
  if (host.endsWith('dropbox.com') || host.endsWith('dropboxusercontent.com')) {
    const d = new URL(s); d.searchParams.delete('dl'); d.searchParams.set('raw', '1')
    return mk('DROPBOX', d.toString(), d.toString())
  }
  if (/\.(mp4|mov|m4v|webm)$/i.test(u.pathname)) return mk('ARQUIVO', s, /\.(mp4|webm)$/i.test(u.pathname) ? s : null)
  return null
}

export const VIDEO_HINT = 'Aceita YouTube, Vimeo, TikTok, Instagram, Facebook, Google Drive, Dropbox ou link de arquivo .mp4. Para virar Reels, use Google Drive (compartilhado com "qualquer pessoa com o link"), Dropbox ou .mp4.'

/** Linha do vídeo para textos onde o link é clicável (Facebook, site). */
export function videoLine(v: VideoLink | null): string {
  return v ? `🎥 Veja o vídeo: ${v.url}` : ''
}

/**
 * Filtro do ffmpeg para vertical 1080×1920: o vídeo inteiro (sem cortar) no
 * centro sobre ele mesmo ampliado e desfocado — nada de faixas pretas.
 */
export const VERTICAL_FILTER =
  "[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:2,eq=brightness=-0.15[b];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[f];[b][f]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p[v]"

/**
 * Lê largura, altura (como aparece: vídeo de celular gravado "em pé" vem
 * girado 90°) e duração da saída de `ffmpeg -i`. Null se não achar o vídeo.
 */
export function parseProbe(out: string): { width: number; height: number; duration: number } | null {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out)
  const v = /Stream #\S+.*Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(out)
  if (!v) return null
  let width = Number(v[1]); let height = Number(v[2])
  const rot = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(out)?.[1] ?? /rotate\s*:\s*(-?\d+)/.exec(out)?.[1]
  if (rot && Math.abs(Math.round(Number(rot))) % 180 === 90) [width, height] = [height, width]
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0
  return { width, height, duration }
}
