// =============================================================================
// Agenda inteligente das redes (PURO, testado) — espalha as publicações entre
// 07:00 e 20:00 (horário da loja), NUNCA duas no mesmo horário, com intervalo
// mínimo por conta e respeitando a quantidade SEGURA por dia (acima disso o
// alcance cai e o Instagram/Facebook pode limitar ou bloquear a conta).
//
// Referências de mercado (2026): feed 1–2 por dia, Reels até 1 por dia,
// Stories 3–5 por dia; limite técnico da API do Instagram: 50 publicações em
// 24 h por conta (Reels e Stories contam). Usamos folga grande abaixo disso.
// =============================================================================

import type { SocialFormat } from './formats'

export const CADENCE = {
  /** Janela de publicação (horário local da loja). */
  startHour: 7,
  endHour: 20,
  /** Intervalo mínimo entre dois posts da MESMA conta. */
  gapSameAccount: 60,
  /** Separação mínima entre quaisquer dois posts da loja (nunca o mesmo horário). */
  gapAnyAccount: 15,
  /** Antecedência mínima a partir de agora. */
  lead: 10,
} as const

export type CadenceKind = 'FEED' | 'REELS' | 'STORY'
export const kindOf = (f: string): CadenceKind => (f === 'STORY' ? 'STORY' : f === 'REELS' || f === 'VIDEO' ? 'REELS' : 'FEED')

/** Quantidade ideal por conta por dia (o sistema nunca passa disso ao espalhar). */
export const DAILY_IDEAL: Record<CadenceKind, number> = { FEED: 2, REELS: 1, STORY: 5 }
export const KIND_LABEL: Record<CadenceKind, string> = { FEED: 'posts no feed (Post/Carrossel)', REELS: 'Reels / vídeo', STORY: 'Stories' }
/** Limite técnico da API do Instagram em 24 h (Reels e Stories contam). */
export const API_DAILY_LIMIT = 50

export const CADENCE_NOTICE = `Quantidade segura por conta, por dia: até ${DAILY_IDEAL.FEED} posts no feed, ${DAILY_IDEAL.REELS} Reels e ${DAILY_IDEAL.STORY} Stories. Acima disso o alcance de cada post cai e o Instagram/Facebook pode entender como spam — limitar o alcance ou bloquear a conta temporariamente.`

export interface Busy { connectionId: string; at: number; format: string }
export interface SlotRequest { key: string; connectionId: string; format: SocialFormat; notBefore?: number; /** Outras contas que saem no MESMO horário (post avulso em várias contas). */ also?: string[] }

const DAY = 1440
const dayOf = (m: number) => Math.floor(m / DAY)
const minuteOfDay = (m: number) => ((m % DAY) + DAY) % DAY
const roundUp = (m: number, step = 5) => Math.ceil(m / step) * step

/** Minutos "locais" (desde 1970, no fuso da loja) ⇄ "AAAA-MM-DDTHH:MM". */
export function localToMinutes(local: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60_000 : null
}
export const minutesToLocal = (m: number) => new Date(m * 60_000).toISOString().slice(0, 16)

/**
 * Horário de cada pedido: o primeiro encaixe livre a partir de `start` (ou do
 * `notBefore` do pedido) dentro da janela, sem colidir com o que já está
 * agendado, com intervalo por conta e sem passar da quantidade diária ideal.
 * Com vários pedidos no mesmo dia, distribui ao longo do dia (não empilha).
 */
export function allocate(requests: SlotRequest[], busy: Busy[], start: number, opts: Partial<typeof CADENCE> = {}): Record<string, number> {
  const c = { ...CADENCE, ...opts }
  const taken: Busy[] = [...busy]
  const out: Record<string, number> = {}
  const open = c.startHour * 60
  const close = c.endHour * 60
  // Passo de distribuição: divide a janela pelos pedidos de cada conta (mín. o intervalo).
  const perAccount = new Map<string, number>()
  for (const r of requests) perAccount.set(r.connectionId, (perAccount.get(r.connectionId) ?? 0) + 1)
  for (const r of requests) {
    const kind = kindOf(r.format)
    const n = perAccount.get(r.connectionId) ?? 1
    const spread = Math.max(c.gapSameAccount, Math.floor((close - open) / Math.max(1, Math.min(n, 6))))
    let t = roundUp(Math.max(start + c.lead, r.notBefore ?? 0))
    for (let guard = 0; guard < 5000; guard++) {
      const md = minuteOfDay(t)
      if (md < open) { t = dayOf(t) * DAY + open; continue }
      if (md > close) { t = (dayOf(t) + 1) * DAY + open; continue }
      const accounts = [r.connectionId, ...(r.also ?? [])]
      const sameDay = taken.filter((b) => accounts.includes(b.connectionId) && dayOf(b.at) === dayOf(t))
      if (accounts.some((acc) => sameDay.filter((b) => b.connectionId === acc && kindOf(b.format) === kind).length >= DAILY_IDEAL[kind])) { t = (dayOf(t) + 1) * DAY + open; continue }
      const clashAccount = sameDay.find((b) => Math.abs(b.at - t) < c.gapSameAccount)
      if (clashAccount) { t = roundUp(Math.max(t + 5, clashAccount.at + (sameDay.length ? spread : c.gapSameAccount))); continue }
      const clashAny = taken.find((b) => Math.abs(b.at - t) < c.gapAnyAccount)
      if (clashAny) { t = roundUp(clashAny.at + c.gapAnyAccount); continue }
      break
    }
    out[r.key] = t
    for (const acc of [r.connectionId, ...(r.also ?? [])]) taken.push({ connectionId: acc, at: t, format: r.format })
  }
  return out
}

/** Carga por conta e por dia (para avisar quando passar do seguro). */
export function overloads(items: Busy[]): Array<{ connectionId: string; day: number; kind: CadenceKind; count: number; ideal: number }> {
  const map = new Map<string, { connectionId: string; day: number; kind: CadenceKind; count: number }>()
  for (const b of items) {
    const k = `${b.connectionId}|${dayOf(b.at)}|${kindOf(b.format)}`
    const cur = map.get(k) ?? { connectionId: b.connectionId, day: dayOf(b.at), kind: kindOf(b.format), count: 0 }
    cur.count++; map.set(k, cur)
  }
  return [...map.values()].filter((x) => x.count > DAILY_IDEAL[x.kind]).map((x) => ({ ...x, ideal: DAILY_IDEAL[x.kind] }))
}
