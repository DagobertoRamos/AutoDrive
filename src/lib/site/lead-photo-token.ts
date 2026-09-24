// Site da loja — token para o cliente enviar as fotos do carro logo depois de
// mandar a pré-avaliação. Assinado (HMAC), amarrado ao lead e à loja, vale 30 min.
// Sem ele, o envio público de fotos é recusado.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const LEAD_PHOTO_TTL_MS = 30 * 60_000
export const LEAD_PHOTO_MAX = 10

const secret = () => process.env.NEXTAUTH_SECRET || 'dev-secret-site-lead-photos'
const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url')

export function createLeadPhotoToken(leadId: string, tenantId: string, now = Date.now(), key = secret()): string {
  const exp = now + LEAD_PHOTO_TTL_MS
  const payload = `${leadId}.${tenantId}.${exp}`
  return `${leadId}.${exp}.${sign(payload, key)}`
}

export function verifyLeadPhotoToken(token: string, tenantId: string, now = Date.now(), key = secret()): string | null {
  const [leadId, expStr, sig] = String(token ?? '').split('.')
  const exp = Number(expStr)
  if (!leadId || !sig || !Number.isFinite(exp) || exp < now) return null
  const expected = Buffer.from(sign(`${leadId}.${tenantId}.${exp}`, key))
  const got = Buffer.from(sig)
  return expected.length === got.length && timingSafeEqual(expected, got) ? leadId : null
}
