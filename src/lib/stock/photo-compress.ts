// Compressão de fotos do estoque NO NAVEGADOR antes do envio: lado maior até
// 1600px, WebP (JPEG se o navegador não gerar WebP). Foto de celular de 5 MB
// vira ~250 KB sem perda visível no site.

export const PHOTO_MAX_SIDE = 1600
const QUALITY = 0.82

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('formato não suportado')) }
    img.src = url
  })
}

export async function compressPhoto(file: File): Promise<Blob> {
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    throw new Error('Foto HEIC do iPhone: exporte como JPG (ou ajuste a câmera para “Mais compatível”).')
  }
  if (!file.type.startsWith('image/')) throw new Error('não é uma imagem')
  const img = await load(file)
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('navegador sem suporte a imagens')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const toBlob = (type: string) => new Promise<Blob | null>((res) => c.toBlob(res, type, QUALITY))
  const webp = await toBlob('image/webp')
  const blob = webp && webp.type === 'image/webp' ? webp : await toBlob('image/jpeg')
  if (!blob) throw new Error('falha ao comprimir')
  return blob
}
