// =============================================================================
// Compressão de foto no aparelho, antes do upload.
// Fotos da galeria/câmera vêm com 3–12 MB e a hospedagem corta o corpo da
// requisição em ~4,5 MB (era o "erro ao subir foto da galeria"). Reduz o lado
// maior para 1920 px em JPEG ~82% (≈300–700 KB), corrigindo a orientação EXIF.
// Formatos que o navegador não decodifica (ex.: HEIC no Chrome) seguem como
// vieram. Só roda no navegador.
// =============================================================================

export interface CompressOptions {
  maxSide?: number
  quality?: number
  /** Abaixo disso (e já JPEG/WebP) nem recomprime. */
  skipBelowBytes?: number
}

const CANVAS_TYPES = /^image\/(jpe?g|png|webp|heic|heif|avif|bmp)$/i

async function decode(file: File): Promise<{ img: CanvasImageSource; w: number; h: number; close: () => void } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { img: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() }
    } catch { /* tenta pelo <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    return { img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxSide = 1920, quality = 0.82, skipBelowBytes = 900 * 1024 } = opts
  if (typeof document === 'undefined' || !CANVAS_TYPES.test(file.type || '')) return file
  if (file.size <= skipBelowBytes && /jpe?g|webp/i.test(file.type)) return file

  const decoded = await decode(file)
  if (!decoded || !decoded.w || !decoded.h) return file
  try {
    const scale = Math.min(1, maxSide / Math.max(decoded.w, decoded.h))
    const w = Math.round(decoded.w * scale)
    const h = Math.round(decoded.h * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(decoded.img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    const name = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  } finally {
    decoded.close()
  }
}

/** Mensagem legível para resposta de upload sem JSON (ex.: 413 da hospedagem). */
export async function uploadErrorMessage(r: Response): Promise<string> {
  const d = await r.json().catch(() => null) as { error?: string } | null
  if (d?.error) return d.error
  if (r.status === 413) return 'Foto muito grande. Tente novamente.'
  return `Falha ao enviar (${r.status}). Tente novamente.`
}
