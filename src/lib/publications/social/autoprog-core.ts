// =============================================================================
// Programação automática — grade semanal (dias × horário × formato) e rodízio
// do estoque. PURO (testado).
//   A cada rodada o sistema olha as próximas 48 h da grade, e para cada
//   horário ainda vazio escolhe um carro disponível: primeiro os que estão há
//   mais tempo sem aparecer nas redes (nunca postados na frente); promoção
//   ganha prioridade se a loja quiser; o mesmo carro não repete no mesmo dia.
// =============================================================================

import { isArtTemplate, isSocialFormat, type ArtTemplate, type SocialFormat } from './formats'
import { musicOf, type MusicChoice } from './music-core'

export interface AutoSlot { days: number[]; time: string; format: SocialFormat }
export interface AutoProgram {
  enabled: boolean
  connectionIds: string[]
  slots: AutoSlot[]
  template: ArtTemplate
  music: MusicChoice | null
  promoFirst: boolean
  /** Não repetir o mesmo carro antes de X dias. */
  minDaysBetween: number
}

export const DEFAULT_PROGRAM: AutoProgram = {
  enabled: false, connectionIds: [], template: 'OFERTA', music: { mode: 'AUTO', mood: 'ANIMADA' }, promoFirst: true, minDaysBetween: 7,
  slots: [
    { days: [1, 2, 3, 4, 5, 6], time: '12:00', format: 'POST' },
    { days: [1, 2, 3, 4, 5], time: '19:00', format: 'REELS' },
    { days: [0, 1, 2, 3, 4, 5, 6], time: '09:00', format: 'STORY' },
  ],
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export function sanitizeProgram(x: unknown, fallback: AutoProgram = DEFAULT_PROGRAM): AutoProgram {
  if (!x || typeof x !== 'object') return fallback
  const p = x as Record<string, unknown>
  const slots = Array.isArray(p.slots)
    ? (p.slots as unknown[]).flatMap((s) => {
        const o = (s ?? {}) as Record<string, unknown>
        const days = Array.isArray(o.days) ? [...new Set((o.days as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []
        if (!days.length || typeof o.time !== 'string' || !TIME.test(o.time) || !isSocialFormat(o.format)) return []
        return [{ days, time: o.time, format: o.format }]
      }).slice(0, 12)
    : fallback.slots
  const gap = Number(p.minDaysBetween)
  return {
    enabled: typeof p.enabled === 'boolean' ? p.enabled : fallback.enabled,
    connectionIds: Array.isArray(p.connectionIds) ? (p.connectionIds as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 10) : fallback.connectionIds,
    slots,
    template: isArtTemplate(p.template) ? p.template : fallback.template,
    music: 'music' in p ? musicOf(p.music) : fallback.music,
    promoFirst: typeof p.promoFirst === 'boolean' ? p.promoFirst : fallback.promoFirst,
    minDaysBetween: Number.isFinite(gap) && gap >= 0 && gap <= 60 ? Math.round(gap) : fallback.minDaysBetween,
  }
}

/** Chave da campanha de um horário da grade (idempotência: um envio por horário). */
export const autoKey = (format: SocialFormat, local: string) => `auto-${format.toLowerCase()}-${local.slice(0, 10)}-${local.slice(11, 13)}${local.slice(14, 16)}`

/** Horários da grade nas próximas `hours` horas a partir de agora (hora local "AAAA-MM-DDTHH:MM"). */
export function upcoming(slots: AutoSlot[], nowLocal: string, hours = 48): Array<{ local: string; format: SocialFormat }> {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(nowLocal)
  if (!m) return []
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  const out: Array<{ local: string; format: SocialFormat }> = []
  for (let d = 0; d <= Math.ceil(hours / 24); d++) {
    const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + d))
    for (const s of slots) {
      if (!s.days.includes(day.getUTCDay())) continue
      const [hh, mm] = s.time.split(':').map(Number)
      const t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm)
      // Só o futuro (margem de 10 min para dar tempo de gerar a mídia) e dentro da janela.
      if (t < base + 10 * 60_000 || t > base + hours * 3_600_000) continue
      out.push({ local: new Date(t).toISOString().slice(0, 16), format: s.format })
    }
  }
  return out.sort((a, b) => a.local.localeCompare(b.local))
}

export interface Candidate { id: string; lastPostedAt: Date | null; promo: boolean; createdAt: Date }

/**
 * Escolhe um carro para cada horário vazio. Rodízio: nunca postado primeiro,
 * depois o que está há mais tempo sem aparecer; promoção na frente se pedido;
 * respeita o intervalo mínimo e não repete o carro no mesmo dia.
 */
export function assign(slots: Array<{ local: string; format: SocialFormat }>, cands: Candidate[], opts: { promoFirst: boolean; minDaysBetween: number; now: Date }): Array<{ local: string; format: SocialFormat; vehicleId: string }> {
  const minGap = opts.minDaysBetween * 86_400_000
  const last = new Map(cands.map((c) => [c.id, c.lastPostedAt?.getTime() ?? null]))
  const byDay = new Map<string, Set<string>>()
  const out: Array<{ local: string; format: SocialFormat; vehicleId: string }> = []
  for (const s of slots) {
    const day = s.local.slice(0, 10)
    const used = byDay.get(day) ?? new Set<string>()
    const at = Date.parse(`${s.local}:00Z`)
    const pool = cands
      .filter((c) => !used.has(c.id))
      .filter((c) => { const l = last.get(c.id); return l == null || at - l >= minGap })
      .sort((a, b) => {
        if (opts.promoFirst && a.promo !== b.promo) return a.promo ? -1 : 1
        const la = last.get(a.id); const lb = last.get(b.id)
        if (la == null && lb != null) return -1
        if (lb == null && la != null) return 1
        if (la != null && lb != null && la !== lb) return la - lb
        return b.createdAt.getTime() - a.createdAt.getTime()
      })
    const pick = pool[0]
    if (!pick) continue
    out.push({ ...s, vehicleId: pick.id })
    used.add(pick.id); byDay.set(day, used)
    last.set(pick.id, at)
  }
  return out
}
