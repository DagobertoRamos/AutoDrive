import { describe, expect, it } from 'vitest'
import { allocate, DAILY_IDEAL, localToMinutes, minutesToLocal, overloads } from './cadence-core'

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
})
