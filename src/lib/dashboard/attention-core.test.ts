import { describe, expect, it } from 'vitest'
import { attentionHeadline, severityFromSla, summarizeAttention, type AttentionItem } from '@/lib/dashboard/attention-core'

const base = (over: Partial<AttentionItem>): AttentionItem => ({
  id: 'x',
  area: 'comercial',
  severity: 'ATENCAO',
  bucket: 'HOJE',
  title: 'Item',
  count: 1,
  href: '/x',
  ...over,
})

describe('dashboard/attention-core', () => {
  it('severidade progressiva por SLA', () => {
    const min = 60_000
    expect(severityFromSla(1 * min, 10 * min)).toBe('INFO')
    expect(severityFromSla(6 * min, 10 * min)).toBe('ATENCAO')
    expect(severityFromSla(12 * min, 10 * min)).toBe('IMPORTANTE')
    expect(severityFromSla(25 * min, 10 * min)).toBe('CRITICO')
    expect(severityFromSla(5 * min, 0)).toBe('INFO')
  })

  it('descarta zerados, deduplica por id e ordena por gravidade', () => {
    const s = summarizeAttention([
      base({ id: 'a', severity: 'INFO', count: 3 }),
      base({ id: 'b', severity: 'CRITICO', bucket: 'CRITICAS', count: 1 }),
      base({ id: 'c', count: 0 }),
      base({ id: 'a', severity: 'IMPORTANTE', count: 2, amount: 100 }),
    ])
    expect(s.items.map((i) => i.id)).toEqual(['b', 'a'])
    expect(s.items[1].count).toBe(5)
    expect(s.items[1].severity).toBe('IMPORTANTE')
    expect(s.items[1].amount).toBe(100)
    expect(s.total).toBe(6)
    expect(s.bySeverity.CRITICO).toBe(1)
  })

  it('manchete sem dado inventado', () => {
    expect(attentionHeadline(summarizeAttention([]))).toMatch(/Tudo em dia/)
    expect(attentionHeadline(summarizeAttention([base({ count: 7 })]))).toBe('7 itens precisam da sua atenção')
  })
})
