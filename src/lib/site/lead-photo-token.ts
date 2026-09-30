// Site da loja — token para o cliente enviar as fotos do carro logo depois de
// mandar a pré-avaliação. Assinado (HMAC), amarrado ao lead e à loja, vale 30 min.
// Sem ele, o envio público de fotos é recusado. `scope` separa os usos (o token
// das fotos da pré-avaliação aponta para a avaliação, não para o lead).
import { createHmac, timingSafeEqual } from 'node:crypto'

export const LEAD_PHOTO_TTL_MS = 30 * 60_000
export const LEAD_PHOTO_MAX = 10

const secret = () => process.env.NEXTAUTH_SECRET || 'dev-secret-site-lead-photos'
const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url')

export function createLeadPhotoToken(leadId: string, tenantId: string, now = Date.now(), key = secret(), scope = ''): string {
  const exp = now + LEAD_PHOTO_TTL_MS
  const payload = `${scope}${leadId}.${tenantId}.${exp}`
  return `${leadId}.${exp}.${sign(payload, key)}`
}

export function verifyLeadPhotoToken(token: string, tenantId: string, now = Date.now(), key = secret(), scope = ''): string | null {
  const [leadId, expStr, sig] = String(token ?? '').split('.')
  const exp = Number(expStr)
  if (!leadId || !sig || !Number.isFinite(exp) || exp < now) return null
  const expected = Buffer.from(sign(`${scope}${leadId}.${tenantId}.${exp}`, key))
  const got = Buffer.from(sig)
  return expected.length === got.length && timingSafeEqual(expected, got) ? leadId : null
}

export const EVAL_PHOTO_SCOPE = 'eval:'
export const createEvalPhotoToken = (evaluationId: string, tenantId: string) => createLeadPhotoToken(evaluationId, tenantId, Date.now(), secret(), EVAL_PHOTO_SCOPE)
export const verifyEvalPhotoToken = (token: string, tenantId: string) => verifyLeadPhotoToken(token, tenantId, Date.now(), secret(), EVAL_PHOTO_SCOPE)
