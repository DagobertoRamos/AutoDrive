// =============================================================================
// Fotos de parceiros servidas pelo próprio app. PURO (client-safe, testado).
//   O navegador não vai mais direto no CDN do parceiro: o CDN da BNDV (Azure
//   Front Door) anuncia IPv6 e não responde nele — em rede com IPv6 a foto
//   ficava pendurada para sempre (nem carregava, nem caía na imagem padrão).
//   /api/integrations/foto baixa por IPv4 no servidor, com tempo limite, e a
//   CDN da Vercel guarda a resposta (as URLs dos parceiros são imutáveis).
//   Só hosts desta lista passam — não é proxy aberto.
//   Feed da Meta, OpenGraph e canais de publicação seguem com a URL original.
// =============================================================================

export const PARTNER_PHOTO_HOSTS: readonly RegExp[] = [
  /(^|\.)bndv\.com\.br$/i,
  /^bndv[a-z0-9]*\.blob\.core\.windows\.net$/i,
  /^autoconf-production\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/i,
]

/** Larguras aceitas pela rota (miniatura → galeria). */
export const PARTNER_PHOTO_WIDTHS = [320, 640, 1280] as const

export function isPartnerPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && PARTNER_PHOTO_HOSTS.some((re) => re.test(u.hostname))
  } catch { return false }
}

/** Largura aceita mais próxima por cima (ou original quando maior que todas). */
export function snapPhotoWidth(w: number | null | undefined): number | null {
  if (!w || !Number.isFinite(w) || w <= 0) return null
  return PARTNER_PHOTO_WIDTHS.find((x) => x >= w) ?? null
}

/** src para <img>: foto de parceiro passa pela rota do app; o resto fica igual. */
export function photoSrc<T extends string | null | undefined>(url: T, width?: number): T | string {
  if (!url || !isPartnerPhotoUrl(url)) return url
  const w = snapPhotoWidth(width)
  return `/api/integrations/foto?u=${encodeURIComponent(url)}${w ? `&w=${w}` : ''}`
}
