// =============================================================================
// Agendamento com fuso da empresa (padrão America/Sao_Paulo), gravado em UTC.
// PURO (testado). Sem biblioteca: usa Intl para descobrir o deslocamento do
// fuso naquele instante (funciona com ou sem horário de verão).
// =============================================================================

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

/** Deslocamento (min) do fuso em relação a UTC no instante dado. SP = -180. */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
}

/**
 * "2026-10-01T09:30" no fuso da loja → instante UTC.
 * Retorna null para texto inválido.
 */
export function localToUtc(local: string, tz: string = DEFAULT_TIMEZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0))
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const naive = Date.UTC(y, mo - 1, d, h, mi, s || 0)
  // Duas passadas resolvem a virada de horário de verão.
  let guess = naive - tzOffsetMinutes(tz, new Date(naive)) * 60_000
  guess = naive - tzOffsetMinutes(tz, new Date(guess)) * 60_000
  const out = new Date(guess)
  return Number.isNaN(out.getTime()) ? null : out
}

/** Instante UTC → "2026-10-01T09:30" no fuso da loja (para campos de formulário). */
export function utcToLocalInput(at: Date, tz: string = DEFAULT_TIMEZONE): string {
  const local = new Date(at.getTime() + tzOffsetMinutes(tz, at) * 60_000)
  return local.toISOString().slice(0, 16)
}

/** Chave do dia (YYYY-MM-DD) no fuso da loja — agrupa o calendário. */
export function dayKey(at: Date, tz: string = DEFAULT_TIMEZONE): string {
  return utcToLocalInput(at, tz).slice(0, 10)
}

/** Validação do agendamento: precisa ser no futuro (com folga) e em até 1 ano. */
export function validateSchedule(at: Date | null, now = new Date()): string | null {
  if (!at) return 'Informe data e hora válidas.'
  if (at.getTime() < now.getTime() + 60_000) return 'Escolha um horário a partir de 1 minuto no futuro.'
  if (at.getTime() > now.getTime() + 366 * 86_400_000) return 'Agende para no máximo 1 ano à frente.'
  return null
}
