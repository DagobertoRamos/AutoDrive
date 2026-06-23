// =============================================================================
// seller-queue/alert-client.ts — alerta CRÍTICO no navegador do vendedor da vez.
// Som (Web Audio — vários modelos), notificação do SO (aba minimizada) e
// vibração. Tudo best-effort e silencioso em caso de erro/bloqueio. O áudio
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

// ── Catálogo de sons ─────────────────────────────────────────────────────────
// Modelos disponíveis para o ADM escolher (chave salva em alertSoundType).
export const SOUND_OPTIONS: { value: string; label: string }[] = [
  { value: 'siren', label: 'Sirene (2 tons)' },
  { value: 'beep',  label: 'Bipe curto (triplo)' },
  { value: 'chime', label: 'Campainha (ascendente)' },
  { value: 'alarm', label: 'Alarme (urgente)' },
  { value: 'bell',  label: 'Sino' },
  { value: 'soft',  label: 'Suave' },
]
export const DEFAULT_SOUND = 'siren'

/** Toca uma nota com envelope (ataque rápido + decaimento exponencial). */
function tone(ac: AudioContext, opts: { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number }) {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = opts.type ?? 'square'
  o.frequency.setValueAtTime(opts.freq, opts.start)
  o.connect(g); g.connect(ac.destination)
  g.gain.setValueAtTime(0.0001, opts.start)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.35, opts.start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur)
  o.start(opts.start)
  o.stop(opts.start + opts.dur + 0.02)
}

const PLAYERS: Record<string, (ac: AudioContext, t: number) => void> = {
  siren: (ac, t) => {
    const o = ac.createOscillator(); const g = ac.createGain()
    o.type = 'square'; o.connect(g); g.connect(ac.destination)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.03)
    o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(660, t + 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85)
    o.start(t); o.stop(t + 0.85)
  },
  beep: (ac, t) => { [0, 0.18, 0.36].forEach((d) => tone(ac, { freq: 1000, start: t + d, dur: 0.12 })) },
  chime: (ac, t) => { [660, 880, 1175].forEach((f, i) => tone(ac, { freq: f, start: t + i * 0.16, dur: 0.22, type: 'sine', gain: 0.3 })) },
  alarm: (ac, t) => { for (let i = 0; i < 6; i++) tone(ac, { freq: i % 2 ? 800 : 1200, start: t + i * 0.12, dur: 0.1 }) },
  bell: (ac, t) => { tone(ac, { freq: 1320, start: t, dur: 1.2, type: 'triangle', gain: 0.32 }); tone(ac, { freq: 2640, start: t, dur: 0.8, type: 'sine', gain: 0.12 }) },
  soft: (ac, t) => { tone(ac, { freq: 587, start: t, dur: 0.4, type: 'sine', gain: 0.25 }); tone(ac, { freq: 784, start: t + 0.4, dur: 0.5, type: 'sine', gain: 0.25 }) },
}

/** Toca o modelo de som escolhido (uma vez). `beep()` mantém compat = sirene. */
export function playSound(type?: string | null): void {
  const ac = audioCtx()
  if (!ac) return
  try { (PLAYERS[type ?? DEFAULT_SOUND] ?? PLAYERS[DEFAULT_SOUND])(ac, ac.currentTime) } catch { /* ignore */ }
}
export function beep(): void { playSound(DEFAULT_SOUND) }

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

// ── App nativo (Capacitor) ─────────────────────────────────────────────────────
// Dentro do app Android, a Web Notification API não funciona e o áudio fica no
// volume de mídia. O plugin nativo LoudAlert faz banner heads-up + alarme alto
// (volume de alarme) + vibração forte de uma só vez.
interface NativeLoudAlert {
  alert: (o: { title: string; body: string }) => Promise<void> | void
  stop?: () => Promise<void> | void
}
function nativeLoudAlert(): NativeLoudAlert | null {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { LoudAlert?: NativeLoudAlert } } }).Capacitor
    if (cap?.isNativePlatform?.() && cap.Plugins?.LoudAlert) return cap.Plugins.LoudAlert
  } catch { /* ignore */ }
  return null
}

/**
 * Alerta CRÍTICO unificado. No app nativo (Android), dispara o plugin LoudAlert
 * (banner + alarme alto + vibração). No navegador/PWA, cai no melhor esforço web
 * (Web Audio + Web Notification + navigator.vibrate), respeitando as flags.
 */
export function criticalAlert(opts: { title: string; body: string; soundType?: string | null; sound?: boolean; push?: boolean }): void {
  const native = nativeLoudAlert()
  if (native) {
    try { void native.alert({ title: opts.title, body: opts.body }) } catch { /* ignore */ }
    return
  }
  if (opts.sound !== false) playSound(opts.soundType)
  if (opts.push !== false) showAlertNotification(opts.title, opts.body)
}

/** Para o alarme nativo (chamar ao aceitar/recusar/sair). No-op no navegador. */
export function stopCriticalAlert(): void {
  const native = nativeLoudAlert()
  try { void native?.stop?.() } catch { /* ignore */ }
}
