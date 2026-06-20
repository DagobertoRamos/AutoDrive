// =============================================================================
// seller-queue/alert-client.ts — alerta CRÍTICO no navegador do vendedor da vez.
// Som (Web Audio, sirene curta), notificação do SO (aba minimizada) e vibração.
// Tudo best-effort e silencioso em caso de erro/bloqueio do navegador. O áudio
// precisa de um gesto do usuário p/ "destravar" (unlockAudio em qualquer clique).
// =============================================================================

type ACtor = typeof AudioContext
let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

/** Destrava o áudio num gesto do usuário (chamar em cliques de botão). */
export function unlockAudio(): void { audioCtx() }

/** Toca uma sirene curta de duas notas (alerta de "vendedor da vez"). */
export function beep(): void {
  const ac = audioCtx()
  if (!ac) return
  try {
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = 'square'
    o.connect(g); g.connect(ac.destination)
    const t = ac.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.03)
    o.frequency.setValueAtTime(880, t)        // nota 1
    o.frequency.setValueAtTime(660, t + 0.35) // nota 2
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85)
    o.start(t); o.stop(t + 0.85)
  } catch { /* ignore */ }
}

/** Pede permissão de notificação do navegador (chamar num gesto do usuário). */
export async function ensureNotifyPermission(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    return (await Notification.requestPermission()) === 'granted'
  } catch { return false }
}

/** Mostra notificação do SO + vibra (se suportado/permitido). */
export function showAlertNotification(title: string, body: string): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag: 'seller-queue-called' })
      setTimeout(() => { try { n.close() } catch { /* ignore */ } }, 8000)
    }
  } catch { /* ignore */ }
  try { navigator.vibrate?.([300, 150, 300, 150, 300]) } catch { /* ignore */ }
}
