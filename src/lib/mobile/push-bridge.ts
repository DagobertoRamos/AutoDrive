// =============================================================================
// push-bridge — ponte JS ↔ plugin nativo Android (PushBridge).
//   registerPushToken() : pega o token FCM e registra em /api/mobile/devices
//   consumePushAction() : lê a ação pendente (accept/reject) que o usuário tocou
//                         na notificação com o app fechado/2º plano.
// No iPhone/PWA/PC o plugin não existe → tudo vira no-op silencioso.
// =============================================================================

export interface AlertStatus {
  available: boolean
  manufacturer: string
  notifications: boolean
  batteryUnrestricted: boolean
  fullScreen: boolean
}

interface PushBridgePlugin {
  getToken: () => Promise<{ token?: string }>
  consumeAction: () => Promise<{ action?: string | null; attId?: string | null }>
  getStatus: () => Promise<AlertStatus>
  openNotifications: () => Promise<void>
  openBattery: () => Promise<void>
  openFullScreen: () => Promise<void>
  openAppDetails: () => Promise<void>
  stopRinger?: () => Promise<void>
}

function bridge(): PushBridgePlugin | null {
  if (typeof window === 'undefined') return null
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
  const p = cap?.Plugins?.PushBridge as PushBridgePlugin | undefined
  return p ?? null
}

let registeredToken: string | null = null

/** Registra (uma vez por token) o aparelho para receber a chamada da fila via push. */
export async function registerPushToken(): Promise<void> {
  const p = bridge()
  if (!p) return
  try {
    const { token } = await p.getToken()
    if (!token || token === registeredToken) return
    const res = await fetch('/api/mobile/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ deviceToken: token, platform: 'ANDROID' }),
    })
    if (res.ok) registeredToken = token
  } catch { /* sem push neste aparelho — segue sem erro */ }
}

/** Lê a ação que o usuário tocou na notificação (accept/reject) e o atendimento. */
export async function consumePushAction(): Promise<{ action: string | null; attId: string | null }> {
  const p = bridge()
  if (!p) return { action: null, attId: null }
  try {
    const r = await p.consumeAction()
    return { action: r?.action ?? null, attId: r?.attId ?? null }
  } catch {
    return { action: null, attId: null }
  }
}

/** true quando rodando dentro do app nativo Android (não PWA/PC). */
export function isNativeAndroid(): boolean {
  return bridge() !== null
}

/** Status das permissões/ajustes do aparelho (Fase 4). null fora do app nativo. */
export async function getAlertStatus(): Promise<AlertStatus | null> {
  const p = bridge()
  if (!p || !p.getStatus) return null
  try {
    return await p.getStatus()
  } catch {
    return null
  }
}

/** Para o alarme nativo + fecha a notificação de chamada (ao aceitar/recusar/encerrar). */
export async function stopNativeRinger(): Promise<void> { try { await bridge()?.stopRinger?.() } catch { /* */ } }

export async function openNotificationSettings(): Promise<void> { try { await bridge()?.openNotifications() } catch { /* */ } }
export async function openBatterySettings(): Promise<void> { try { await bridge()?.openBattery() } catch { /* */ } }
export async function openFullScreenSettings(): Promise<void> { try { await bridge()?.openFullScreen() } catch { /* */ } }
export async function openAppDetailsSettings(): Promise<void> { try { await bridge()?.openAppDetails() } catch { /* */ } }
