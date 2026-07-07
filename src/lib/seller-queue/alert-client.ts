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
  { value: 'siren',       label: 'Sirene (2 tons)' },
  { value: 'beep',        label: 'Bipe curto (triplo)' },
  { value: 'chime',       label: 'Campainha (ascendente)' },
  { value: 'alarm',       label: 'Alarme (urgente)' },
  { value: 'bell',        label: 'Sino' },
  { value: 'soft',        label: 'Suave' },
  { value: 'double_beep', label: 'Bipe duplo rápido' },
  { value: 'buzzer',      label: 'Zumbido (sawtooth)' },
  { value: 'strobe',      label: 'Estroboscópio (rápido)' },
  { value: 'sonar',       label: 'Sonar (submarino)' },
  { value: 'space',       label: 'Alarme Espacial' },
  { value: 'elevator',    label: 'Chime Elevador Duplo' },
  { value: 'ringtone',    label: 'Telefone Clássico' },
  { value: 'laser',       label: 'Disparo Laser' },
  { value: 'melody',      label: 'Melodia Alegre' },
  { value: 'panic',       label: 'Pânico Industrial' },
]
export const DEFAULT_SOUND = 'siren'

export const VIBRATION_PATTERNS: Record<string, number[]> = {
  siren: [500, 250, 500, 250],
  beep: [100, 100, 100, 100, 100],
  chime: [150, 100, 250],
  alarm: [800, 200, 800, 200],
  bell: [300, 500],
  soft: [150, 300],
  double_beep: [100, 50, 100],
  buzzer: [600, 100, 600],
  strobe: [50, 50, 50, 50, 50, 50, 50, 50],
  sonar: [400, 800],
  space: [200, 100, 200, 100],
  elevator: [150, 80, 150],
  ringtone: [300, 100, 300, 100, 300, 100],
  laser: [80, 80, 80, 80],
  melody: [100, 50, 100, 50, 150],
  panic: [1000, 100, 1000],
}

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
  double_beep: (ac, t) => { [0, 0.15].forEach((d) => tone(ac, { freq: 1200, start: t + d, dur: 0.08, type: 'triangle', gain: 0.4 })) },
  buzzer: (ac, t) => { tone(ac, { freq: 150, start: t, dur: 0.6, type: 'sawtooth', gain: 0.35 }) },
  strobe: (ac, t) => { for (let i = 0; i < 8; i++) tone(ac, { freq: 2000, start: t + i * 0.08, dur: 0.04, type: 'square', gain: 0.4 }) },
  sonar: (ac, t) => { tone(ac, { freq: 880, start: t, dur: 0.15, type: 'sine', gain: 0.4 }); tone(ac, { freq: 440, start: t + 0.15, dur: 0.5, type: 'sine', gain: 0.1 }) },
  space: (ac, t) => {
    const o = ac.createOscillator(); const g = ac.createGain()
    o.type = 'sawtooth'; o.connect(g); g.connect(ac.destination)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.05)
    o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    o.start(t); o.stop(t + 0.6)
  },
  elevator: (ac, t) => { tone(ac, { freq: 880, start: t, dur: 0.25, type: 'sine', gain: 0.35 }); tone(ac, { freq: 880, start: t + 0.2, dur: 0.25, type: 'sine', gain: 0.35 }) },
  ringtone: (ac, t) => {
    for (let i = 0; i < 4; i++) {
      tone(ac, { freq: 900, start: t + i * 0.15, dur: 0.06, type: 'square', gain: 0.3 })
      tone(ac, { freq: 1100, start: t + i * 0.15 + 0.06, dur: 0.06, type: 'square', gain: 0.3 })
    }
  },
  laser: (ac, t) => {
    for (let i = 0; i < 3; i++) {
      const start = t + i * 0.2
      const o = ac.createOscillator(); const g = ac.createGain()
      o.type = 'sawtooth'; o.connect(g); g.connect(ac.destination)
      g.gain.setValueAtTime(0.35, start); g.gain.linearRampToValueAtTime(0.0001, start + 0.15)
      o.frequency.setValueAtTime(1200, start); o.frequency.exponentialRampToValueAtTime(100, start + 0.15)
      o.start(start); o.stop(start + 0.15)
    }
  },
  melody: (ac, t) => {
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => tone(ac, { freq: f, start: t + i * 0.1, dur: 0.15, type: 'sine', gain: 0.35 }))
  },
  panic: (ac, t) => {
    const o = ac.createOscillator(); const g = ac.createGain()
    o.type = 'sawtooth'; o.connect(g); g.connect(ac.destination)
    g.gain.setValueAtTime(0.38, t)
    o.frequency.setValueAtTime(600, t)
    o.frequency.linearRampToValueAtTime(1400, t + 0.15)
    o.frequency.linearRampToValueAtTime(600, t + 0.3)
    o.frequency.linearRampToValueAtTime(1400, t + 0.45)
    o.frequency.linearRampToValueAtTime(600, t + 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    o.start(t); o.stop(t + 0.7)
  },
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

/** Mostra notificação do SO + vibra (se suportado/permitido). Aparece mesmo com
 *  a aba em segundo plano; fica fixa até o vendedor interagir. */
export function showAlertNotification(title: string, body: string, soundType?: string | null): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag: 'seller-queue-called', requireInteraction: true, renotify: true } as NotificationOptions)
      n.onclick = () => { try { window.focus(); n.close() } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
  try {
    const pattern = (soundType && VIBRATION_PATTERNS[soundType]) ? VIBRATION_PATTERNS[soundType] : [300, 150, 300, 150, 300]
    navigator.vibrate?.(pattern)
  } catch { /* ignore */ }
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

// Silêncio temporário após aceitar/recusar: o vigia global pode disparar mais
// uma vez antes de perceber a mudança de status (poll). Durante a janela de mute,
// criticalAlert vira no-op, evitando que o alarme volte a apitar após o aceite.
let mutedUntil = 0
export const ALERT_STOP_EVENT = 'sq:alert-stop'

/**
 * Alerta CRÍTICO unificado. No app nativo (Android), dispara o plugin LoudAlert
 * (banner + alarme alto + vibração). No navegador/PWA, cai no melhor esforço web
 * (Web Audio + Web Notification + navigator.vibrate), respeitando as flags.
 */
export function criticalAlert(opts: { title: string; body: string; soundType?: string | null; sound?: boolean; push?: boolean }): void {
  if (Date.now() < mutedUntil) return // silenciado logo após aceitar/recusar
  const native = nativeLoudAlert()
  if (native) {
    try { void native.alert({ title: opts.title, body: opts.body }) } catch { /* ignore */ }
    return
  }
  if (opts.sound !== false) playSound(opts.soundType)
  if (opts.push !== false) showAlertNotification(opts.title, opts.body, opts.soundType)
}

/** Para o alarme imediatamente (aceitar/recusar/sair): silencia por uma janela
 *  curta, para o plugin nativo e avisa o vigia global para encerrar o loop. */
export function stopCriticalAlert(): void {
  mutedUntil = Date.now() + 12000
  const native = nativeLoudAlert()
  try { void native?.stop?.() } catch { /* ignore */ }
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ALERT_STOP_EVENT)) } catch { /* ignore */ }
}
