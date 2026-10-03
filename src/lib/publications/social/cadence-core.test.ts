import { describe, expect, it } from 'vitest'
import { allocate, cadenceFrom, DAILY_IDEAL, DEFAULT_POSTING, gapFor, localToMinutes, minutesToLocal, overloads, sanitizePosting } from './cadence-core'

const at = (s: string) => localToMinutes(s)!
const local = (m: number) => minutesToLocal(m)

describe('Agenda inteligente das redes', () => {
  it('2 carros × Post/Reels/Story em 2 contas: nenhum horário repetido, tudo entre 07:00 e 20:00', () => {
    const reqs = ['v1', 'v2'].flatMap((v) => ['IG', 'FB'].flatMap((c) => (['POST', 'REELS', 'STORY'] as const).map((f) => ({ key: `${v}:${c}:${f}`, connectionId: c, format: f }))))
    const out = allocate(reqs, [], at('2026-09-29T06:30'))
    const times = Object.values(out)
    expect(new Set(times).size).toBe(times.length)
    for (const t of times) { const h = Number(local(t).slice(11, 13)); expect(h).toBeGreaterThanOrEqual(7); expect(h).toBeLessThanOrEqual(20) }
    // Quaisquer dois posts da loja com pelo menos 15 min; da mesma conta, 60 min.
    const sorted = [...times].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(15)
    const ig = Object.entries(out).filter(([k]) => k.includes(':IG:')).map(([, t]) => t).sort((a, b) => a - b)
    for (let i = 1; i < ig.length; i++) expect(ig[i] - ig[i - 1]).toBeGreaterThanOrEqual(60)
  })
  it('nunca passa da quantidade diária ideal: o excedente vai para o dia seguinte', () => {
    const reqs = Array.from({ length: 3 }, (_, i) => ({ key: `r${i}`, connectionId: 'IG', format: 'REELS' as const }))
    const out = allocate(reqs, [], at('2026-09-29T08:00'))
    const days = Object.values(out).map((t) => local(t).slice(0, 10))
    expect(days).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
    expect(DAILY_IDEAL.REELS).toBe(1)
  })
  it('respeita o que já está agendado e não publica depois das 20:00', () => {
    const busy = [{ connectionId: 'IG', at: at('2026-09-29T19:00'), format: 'POST' }]
    const out = allocate([{ key: 'a', connectionId: 'FB', format: 'POST' }], busy, at('2026-09-29T19:00'))
    expect(local(out.a)).not.toBe('2026-09-29T19:00')
    const late = allocate([{ key: 'b', connectionId: 'IG', format: 'STORY' }], [], at('2026-09-29T20:30'))
    expect(local(late.b)).toBe('2026-09-30T07:00')
  })
  it('avisa quando passa do seguro', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ connectionId: 'IG', at: at('2026-09-29T09:00') + i * 60, format: 'POST' }))
    expect(overloads(items)).toEqual([expect.objectContaining({ connectionId: 'IG', kind: 'FEED', count: 3, ideal: 2 })])
  })
  it('lote de 28 carros: mesma conta sempre 2 a 3 h de distância, dentro da janela da loja, sem encostar no que já estava agendado', () => {
    const rules = sanitizePosting({ windowStart: '09:00', windowEnd: '19:00', gapMin: 120, gapMax: 180, perDay: { FEED: 4 } })
    const busy = [{ connectionId: 'IG', at: at('2026-10-05T10:00'), format: 'POST' }, { connectionId: 'IG', at: at('2026-10-05T15:30'), format: 'POST' }]
    const reqs = Array.from({ length: 28 }, (_, i) => ({ key: `v${i}|IG|POST`, connectionId: 'IG', format: 'POST' as const }))
    const out = allocate(reqs, busy, at('2026-10-05T08:00'), cadenceFrom(rules))
    const all = [...Object.values(out), ...busy.map((b) => b.at)].sort((a, b) => a - b)
    for (let i = 1; i < all.length; i++) if (local(all[i]).slice(0, 10) === local(all[i - 1]).slice(0, 10)) expect(all[i] - all[i - 1]).toBeGreaterThanOrEqual(120)
    for (const t of Object.values(out)) { const hm = local(t).slice(11); expect(hm >= '09:00' && hm <= '19:00').toBe(true) }
    // Nunca mais de 4 posts no feed por dia nessa conta (contando os que já estavam agendados).
    const perDay = new Map<string, number>()
    for (const t of all) perDay.set(local(t).slice(0, 10), (perDay.get(local(t).slice(0, 10)) ?? 0) + 1)
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(4)
  })
  it('intervalo sorteado entre o mínimo e o máximo; regras inválidas voltam ao padrão', () => {
    const gaps = Array.from({ length: 50 }, (_, i) => gapFor(`k${i}`, 120, 180))
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(120)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(180)
    expect(new Set(gaps).size).toBeGreaterThan(3)
    expect(sanitizePosting({ windowStart: '20:00', windowEnd: '08:00', gapMin: 5, mediaKeepDays: 99 })).toMatchObject({ windowStart: DEFAULT_POSTING.windowStart, windowEnd: DEFAULT_POSTING.windowEnd, gapMin: 120, mediaKeepDays: 5 })
  })
})
