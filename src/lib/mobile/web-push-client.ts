// =============================================================================
// web-push-client — habilita Web Push no PWA (inclui iPhone iOS 16.4+).
// Registra o service worker, pede permissão, assina e envia ao servidor.
// =============================================================================

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function webPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** No iPhone, Web Push só funciona com o app ADICIONADO À TELA DE INÍCIO (standalone). */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  const mm = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return !!mm || iosStandalone
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

async function vapidKey(): Promise<string | null> {
  const fromBuild = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (fromBuild) return fromBuild
  try {
    const r = await fetch('/api/mobile/web-push/subscribe', { credentials: 'include' })
    const j = await r.json()
    return j?.publicKey ?? null
  } catch { return null }
}

export async function enableWebPush(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof Notification === 'undefined') return { ok: false, reason: 'sem suporte a notificações neste navegador' }
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'sem service worker (abra pelo ícone na Tela de Início)' }
  if (!('PushManager' in window)) return { ok: false, reason: 'navegador sem Push (iPhone: adicione à Tela de Início e abra pelo ícone)' }
  const vapid = await vapidKey()
  if (!vapid) return { ok: false, reason: 'chave do servidor indisponível' }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: 'denied' }
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource })
    }
    const res = await fetch('/api/mobile/web-push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ subscription: sub }),
    })
    if (!res.ok) return { ok: false, reason: 'falha ao registrar no servidor (' + res.status + ')' }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

/** Re-assina silenciosamente se já houver permissão (mantém a inscrição viva). */
export async function refreshWebPushIfGranted(): Promise<void> {
  if (!webPushSupported() || Notification.permission !== 'granted') return
  await enableWebPush().catch(() => {})
}
