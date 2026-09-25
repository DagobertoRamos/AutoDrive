// =============================================================================
// Link assinado de imagem para os canais. PURO (testado).
// O portal/rede precisa baixar a foto durante todo o processamento (às vezes
// horas depois). O link assinado:
//   • só aponta para foto de VEÍCULO da própria loja (nunca foto de lead);
//   • expira (padrão 30 dias) e não pode ser alterado (HMAC-SHA256);
//   • entrega a variante pedida (JPEG, largura máxima) sem recortar o carro.
// Segredo: PUBLICATIONS_MEDIA_SECRET (ou NEXTAUTH_SECRET).
// =============================================================================

import { createHmac, timingSafeEqual } from 'crypto'

export interface MediaClaims {
  t: string // tenantId
  a?: string // id do arquivo (site_assets)
  u?: string // URL externa já cadastrada na galeria (importada com proteção SSRF)
  w: number // largura máxima da variante
  e: number // expira (epoch s)
}

const b64 = (s: Buffer | string) => Buffer.from(s).toString('base64url')

function secret(): string {
  const s = process.env.PUBLICATIONS_MEDIA_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('PUBLICATIONS_MEDIA_SECRET/NEXTAUTH_SECRET ausente')
    return 'dev-only-media-secret'
  }
  return s
}

export function signMedia(claims: MediaClaims, key = secret()): string {
  const body = b64(JSON.stringify(claims))
  const sig = createHmac('sha256', key).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyMedia(token: string, now = new Date(), key = secret()): MediaClaims | null {
  const [body, sig] = String(token ?? '').split('.')
  if (!body || !sig || body.length > 4000) return null
  const expected = createHmac('sha256', key).update(body).digest('base64url')
  const a = Buffer.from(sig); const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as MediaClaims
    if (typeof c.t !== 'string' || typeof c.e !== 'number' || typeof c.w !== 'number') return null
    if (!c.a && !c.u) return null
    if (c.e * 1000 < now.getTime()) return null
    return c
  } catch { return null }
}

const ASSET = /\/api\/site\/assets\/([a-z0-9]{10,40})(?:\?.*)?$/i

/** URL pública assinada para uma foto da galeria. */
export function mediaUrlFor(origin: string, tenantId: string, photoUrl: string, opts: { width?: number; ttlDays?: number; now?: Date } = {}): string {
  const now = opts.now ?? new Date()
  const m = ASSET.exec(photoUrl)
  const claims: MediaClaims = {
    t: tenantId, w: Math.min(Math.max(opts.width ?? 1920, 320), 4096),
    e: Math.floor(now.getTime() / 1000) + (opts.ttlDays ?? 30) * 86_400,
    ...(m ? { a: m[1] } : { u: photoUrl }),
  }
  // Prefixo /api/integrations: rota pública (sem sessão), fora do proxy de login.
  return `${origin.replace(/\/+$/, '')}/api/integrations/publications/media/${signMedia(claims)}.jpg`
}
