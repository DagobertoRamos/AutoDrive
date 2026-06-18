// =============================================================================
// telephony/storage/external.provider.ts — gravações hospedadas em URL externa
// (ex.: a própria URL do provedor de telefonia). Servidas por PROXY server-side
// com guarda anti-SSRF: só https, host público e em allowlist explícita.
// (`TELEPHONY_RECORDING_ALLOWED_HOSTS`, lista separada por vírgula).
// =============================================================================

import type { RecordingStorageProvider, PlaybackSource } from './types'

function allowedHosts(): string[] {
  return (process.env.TELEPHONY_RECORDING_ALLOWED_HOSTS || '')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
}

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[0-1])\./

export function isSafeExternalUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (PRIVATE_HOST.test(host) || PRIVATE_172.test(host)) return false
  const allow = allowedHosts()
  if (allow.length === 0) return false // sem allowlist, não fazemos proxy (anti-SSRF)
  return allow.some((h) => host === h || host.endsWith(`.${h}`))
}

export class ExternalUrlStorageProvider implements RecordingStorageProvider {
  readonly kind = 'external'
  get ready(): boolean { return allowedHosts().length > 0 }

  canHandle(ref: string): boolean {
    return /^https?:\/\//i.test(ref)
  }

  getPlayback(ref: string): PlaybackSource {
    if (isSafeExternalUrl(ref)) return { kind: 'proxy', url: ref }
    return { kind: 'unavailable', reason: 'URL de gravação externa não permitida (defina TELEPHONY_RECORDING_ALLOWED_HOSTS com o host do provedor).' }
  }
}
