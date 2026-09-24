// Site da loja — validação de arquivos enviados. PURO (testado).
// Confere o CONTEÚDO (assinatura), não a extensão: só PNG, JPEG e WebP.

export const SITE_ASSET_KINDS = ['LOGO', 'LOGO_LIGHT', 'FAVICON', 'IMAGE'] as const
export type SiteAssetKind = (typeof SITE_ASSET_KINDS)[number]
export const SITE_ASSET_MAX_BYTES = 2 * 1024 * 1024

export function sniffImage(buf: Uint8Array): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number | null; height: number | null } | null {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    // IHDR: largura/altura em big-endian nos bytes 16–23.
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    return { mime: 'image/png', width: dv.getUint32(16), height: dv.getUint32(20) }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', width: null, height: null }
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(0, 4)) === 'RIFF' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP') return { mime: 'image/webp', width: null, height: null }
  return null
}

export function siteAssetUrl(id: string): string {
  return `/api/site/assets/${id}`
}
