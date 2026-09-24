// Site da loja — validação do que o lojista edita no anúncio. PURO (testado).
export interface ListingInput {
  featured: boolean
  hidden: boolean
  title: string | null
  description: string | null
  options: string[]
  videoUrl: string | null
  seoTitle: string | null
  seoDescription: string | null
}

const text = (v: unknown, max: number) => { const s = String(v ?? '').trim().slice(0, max); return s || null }

/** Só aceita vídeo do YouTube ou arquivo https (o site incorpora os dois). */
export function cleanVideoUrl(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/^https:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{6,}/i.test(s)) return s.slice(0, 300)
  if (/^https:\/\/[^\s]+\.(mp4|webm)(\?.*)?$/i.test(s)) return s.slice(0, 500)
  return null
}

export function sanitizeListingInput(body: unknown): { ok: true; value: ListingInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const rawVideo = String(b.videoUrl ?? '').trim()
  const videoUrl = cleanVideoUrl(rawVideo)
  if (rawVideo && !videoUrl) return { ok: false, error: 'Vídeo: use um link do YouTube ou de um arquivo .mp4/.webm (https).' }
  const rawOptions = Array.isArray(b.options) ? b.options : String(b.options ?? '').split(/[\n,;]+/)
  const options = [...new Set(rawOptions.map((o) => String(o ?? '').trim().slice(0, 60)).filter(Boolean))].slice(0, 60)
  return {
    ok: true,
    value: {
      featured: Boolean(b.featured), hidden: Boolean(b.hidden),
      title: text(b.title, 120), description: text(b.description, 5000), options, videoUrl,
      seoTitle: text(b.seoTitle, 70), seoDescription: text(b.seoDescription, 170),
    },
  }
}
