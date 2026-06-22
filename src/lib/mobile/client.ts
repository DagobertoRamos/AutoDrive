// =============================================================================
// mobile/client.ts — utilitários do cliente mobile (PWA/Capacitor).
// Lê/normaliza os headers de identificação do app mobile. NÃO contém segredos e
// NÃO faz chamadas externas — apenas saneamento de strings. Usado pelo backend
// (ex.: /api/mobile/bootstrap) para identificar a plataforma do cliente.
// =============================================================================

/** Headers enviados pelo app mobile (Capacitor/PWA). */
export const MOBILE_HEADERS = {
  deviceId:   'x-autodrive-device-id',
  platform:   'x-autodrive-platform',
  appVersion: 'x-autodrive-app-version',
} as const

export type MobilePlatform = 'android' | 'ios' | 'web' | 'unknown'

const MAX_LEN = 120

/** Remove CR/LF/tab, apara espaços e limita a 120 caracteres. Nunca lança. */
export function sanitizeHeaderValue(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/[\r\n\t]+/g, '').trim().slice(0, MAX_LEN)
}

/** Normaliza a plataforma: android | ios | web; qualquer outra → unknown. */
export function normalizePlatform(value: string | null | undefined): MobilePlatform {
  const v = sanitizeHeaderValue(value).toLowerCase()
  return v === 'android' || v === 'ios' || v === 'web' ? v : 'unknown'
}

export interface MobileClientInfo {
  deviceId:   string
  platform:   MobilePlatform
  appVersion: string
}

/** Objeto com `.get(name)` (ex.: Headers do Request). */
export interface HeaderGetter {
  get(name: string): string | null
}

/** Extrai e normaliza os dados do cliente mobile a partir dos headers. */
export function readMobileClient(headers: HeaderGetter): MobileClientInfo {
  return {
    deviceId:   sanitizeHeaderValue(headers.get(MOBILE_HEADERS.deviceId)),
    platform:   normalizePlatform(headers.get(MOBILE_HEADERS.platform)),
    appVersion: sanitizeHeaderValue(headers.get(MOBILE_HEADERS.appVersion)),
  }
}

/** true se a requisição vem do app nativo (android/ios). web/unknown → false. */
export function isMobileClient(info: MobileClientInfo): boolean {
  return info.platform === 'android' || info.platform === 'ios'
}
