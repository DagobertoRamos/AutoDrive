// =============================================================================
// Agenda inteligente das redes (PURO, testado) — espalha as publicações dentro
// da janela configurada pela loja (padrão 07:00–20:00), NUNCA duas no mesmo
// horário, com intervalo de 2 a 3 h entre posts da mesma conta (configurável,
// sorteado para não parecer robô) e respeitando a quantidade SEGURA por dia
// (acima disso o alcance cai e o Instagram/Facebook pode limitar ou bloquear).
//
// Referências de mercado (2026): feed 1–2 por dia, Reels até 1 por dia,
// Stories 3–5 por dia; limite técnico da API do Instagram: 50 publicações em
// 24 h por conta (Reels e Stories contam). Usamos folga grande abaixo disso.
// =============================================================================

import type { SocialFormat } from './formats'

export const CADENCE = {
  /** Janela padrão de publicação (horário local da loja) — a loja muda em Canais conectados. */
  startHour: 7,
  endHour: 20,
  /** Intervalo mínimo padrão entre dois posts da MESMA conta. */
  gapSameAccount: 120,
  /** Separação mínima entre quaisquer dois posts da loja (nunca o mesmo horário). */
  gapAnyAccount: 15,
  /** Antecedência mínima a partir de agora. */
  lead: 10,
} as const

export type CadenceKind = 'FEED' | 'REELS' | 'STORY'
export const kindOf = (f: string): CadenceKind => (f === 'STORY' ? 'STORY' : f === 'REELS' || f === 'VIDEO' ? 'REELS' : 'FEED')

/** Quantidade ideal por conta por dia (padrão; a loja ajusta nas regras de disparo). */
export const DAILY_IDEAL: Record<CadenceKind, number> = { FEED: 2, REELS: 1, STORY: 5 }
export const KIND_LABEL: Record<CadenceKind, string> = { FEED: 'posts no feed (Post/Carrossel)', REELS: 'Reels / vídeo', STORY: 'Stories' }
/** Limite técnico da API do Instagram em 24 h (Reels e Stories contam). */
export const API_DAILY_LIMIT = 50

export const CADENCE_NOTICE = `Quantidade segura por conta, por dia: até ${DAILY_IDEAL.FEED} posts no feed, ${DAILY_IDEAL.REELS} Reels e ${DAILY_IDEAL.STORY} Stories. Acima disso o alcance de cada post cai e o Instagram/Facebook pode entender como spam — limitar o alcance ou bloquear a conta temporariamente.`

/**
 * Regras de disparo da loja (Canais conectados › Contatos e regras): janela do
 * dia, intervalo entre posts da mesma conta (sorteado entre o mínimo e o
 * máximo), quantidade por dia e por quantos dias as mídias/vídeos ficam
 * guardados depois de publicados (para baixar e postar fora).
 */
export interface PostingRules {
  windowStart: string
  windowEnd: string
  gapMin: number
  gapMax: number
  perDay: Record<CadenceKind, number>
  mediaKeepDays: number
}
export const DEFAULT_POSTING: PostingRules = {
  windowStart: '07:00', windowEnd: '20:00', gapMin: 120, gapMax: 180,
  perDay: { ...DAILY_IDEAL }, mediaKeepDays: 5,
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const int = (v: unknown, min: number, max: number, fb: number) => { const n = Math.round(Number(v)); return v != null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : fb }

export function sanitizePosting(x: unknown, fb: PostingRules = DEFAULT_POSTING): PostingRules {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  let windowStart = typeof o.windowStart === 'string' && HHMM.test(o.windowStart) ? o.windowStart : fb.windowStart
  let windowEnd = typeof o.windowEnd === 'string' && HHMM.test(o.windowEnd) ? o.windowEnd : fb.windowEnd
  // Janela de pelo menos 1 hora.
  if (toMin(windowEnd) - toMin(windowStart) < 60) { windowStart = fb.windowStart; windowEnd = fb.windowEnd }
  const gapMin = int(o.gapMin, 15, 720, fb.gapMin)
  const gapMax = Math.max(gapMin, int(o.gapMax, 15, 720, fb.gapMax))
  const pd = (o.perDay && typeof o.perDay === 'object' ? o.perDay : {}) as Record<string, unknown>
  return {
    windowStart, windowEnd, gapMin, gapMax,
    perDay: { FEED: int(pd.FEED, 1, 10, fb.perDay.FEED), REELS: int(pd.REELS, 1, 5, fb.perDay.REELS), STORY: int(pd.STORY, 1, 20, fb.perDay.STORY) },
    mediaKeepDays: int(o.mediaKeepDays, 1, 30, fb.mediaKeepDays),
  }
}

export interface AllocateOptions { open: number; close: number; gapMin: number; gapMax: number; gapAny?: number; lead?: number; perDay?: Record<CadenceKind, number> }

/** Opções do encaixe a partir das regras da loja. */
export function cadenceFrom(r: PostingRules): AllocateOptions {
  return { open: toMin(r.windowStart), close: toMin(r.windowEnd), gapMin: r.gapMin, gapMax: r.gapMax, perDay: r.perDay }
}

export interface Busy { connectionId: string; at: number; format: string }
export interface SlotRequest { key: string; connectionId: string; format: SocialFormat; notBefore?: number; /** Outras contas que saem no MESMO horário (post avulso em várias contas). */ also?: string[] }

const DAY = 1440
const dayOf = (m: number) => Math.floor(m / DAY)
const minuteOfDay = (m: number) => ((m % DAY) + DAY) % DAY
const roundUp = (m: number, step = 5) => Math.ceil(m / step) * step

/** Intervalo deste pedido: sorteio estável (pela chave) entre o mínimo e o máximo, em passos de 5 min. */
export function gapFor(key: string, gapMin: number, gapMax: number): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const steps = Math.floor((gapMax - gapMin) / 5) + 1
  return gapMin + (h % steps) * 5
}

/** Minutos "locais" (desde 1970, no fuso da loja) ⇄ "AAAA-MM-DDTHH:MM". */
export function localToMinutes(local: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60_000 : null
}
export const minutesToLocal = (m: number) => new Date(m * 60_000).toISOString().slice(0, 16)

/**
 * Horário de cada pedido: o primeiro encaixe livre a partir de `start` (ou do
 * `notBefore` do pedido) dentro da janela da loja, sem colidir com o que já
 * está agendado — na MESMA conta, intervalo de 2 a 3 h (configurável); entre
 * contas, nunca no mesmo horário — e sem passar da quantidade por dia.
 */
export function allocate(requests: SlotRequest[], busy: Busy[], start: number, opts: Partial<AllocateOptions> = {}): Record<string, number> {
  const c = { ...cadenceFrom(DEFAULT_POSTING), gapAny: CADENCE.gapAnyAccount, lead: CADENCE.lead, ...opts }
  const perDay = c.perDay ?? DAILY_IDEAL
  const gapAny = c.gapAny ?? CADENCE.gapAnyAccount
  const spreadOf = (k: CadenceKind) => Math.floor((c.close - c.open) / Math.max(1, perDay[k]))
  const taken: Busy[] = [...busy]
  const out: Record<string, number> = {}
  for (const r of requests) {
    const kind = kindOf(r.format)
    const gap = gapFor(r.key, c.gapMin, c.gapMax)
    const accounts = [r.connectionId, ...(r.also ?? [])]
    let t = roundUp(Math.max(start + (c.lead ?? 0), r.notBefore ?? 0))
    for (let guard = 0; guard < 20000; guard++) {
      const md = minuteOfDay(t)
      if (md < c.open) { t = dayOf(t) * DAY + c.open; continue }
      if (md > c.close) { t = (dayOf(t) + 1) * DAY + c.open; continue }
      const sameDay = taken.filter((b) => accounts.includes(b.connectionId) && dayOf(b.at) === dayOf(t))
      if (accounts.some((acc) => sameDay.filter((b) => b.connectionId === acc && kindOf(b.format) === kind).length >= perDay[kind])) { t = (dayOf(t) + 1) * DAY + c.open; continue }
      // Mesmo tipo na mesma conta: espalha a cota do dia pela janela (ex.: 2 posts → manhã e tarde).
      const need = (b: Busy) => (kindOf(b.format) === kind ? Math.max(gap, spreadOf(kind)) : gap)
      const clashAccount = taken.find((b) => accounts.includes(b.connectionId) && Math.abs(b.at - t) < need(b))
      if (clashAccount) { t = roundUp(Math.max(t + 5, clashAccount.at + need(clashAccount))); continue }
      const clashAny = taken.find((b) => Math.abs(b.at - t) < gapAny)
      if (clashAny) { t = roundUp(clashAny.at + gapAny); continue }
      break
    }
    out[r.key] = t
    for (const acc of accounts) taken.push({ connectionId: acc, at: t, format: r.format })
  }
  return out
}

/** Carga por conta e por dia (para avisar quando passar do seguro). */
export function overloads(items: Busy[], perDay: Record<CadenceKind, number> = DAILY_IDEAL): Array<{ connectionId: string; day: number; kind: CadenceKind; count: number; ideal: number }> {
  const map = new Map<string, { connectionId: string; day: number; kind: CadenceKind; count: number }>()
  for (const b of items) {
    const k = `${b.connectionId}|${dayOf(b.at)}|${kindOf(b.format)}`
    const cur = map.get(k) ?? { connectionId: b.connectionId, day: dayOf(b.at), kind: kindOf(b.format), count: 0 }
    cur.count++; map.set(k, cur)
  }
  return [...map.values()].filter((x) => x.count > perDay[x.kind]).map((x) => ({ ...x, ideal: perDay[x.kind] }))
}
