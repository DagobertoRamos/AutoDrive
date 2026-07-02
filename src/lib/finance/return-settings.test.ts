import { describe, expect, it } from 'vitest'
import { findActiveIofOverlap, normalizeIofRows } from '@/lib/finance/return-settings'

describe('return-settings (Retorno/F&I)', () => {
  it('detecta regras de IOF ativas com vigencia sobreposta', () => {
    const overlap = findActiveIofOverlap([
      { startsAt: '2026-07-01', endsAt: '2026-12-31', value: 5, valueType: 'PERCENTUAL', active: true },
      { startsAt: '2026-12-01', endsAt: '2027-03-31', value: 4, valueType: 'PERCENTUAL', active: true },
    ])

    expect(overlap).toEqual({ firstIndex: 0, secondIndex: 1 })
  })

  it('normaliza IOF legado mensal para vigencia do mes', () => {
    const [row] = normalizeIofRows([{ month: 7, year: 2026, value: 5, valueType: 'PERCENTUAL', active: true }])

    expect(row.startsAt).toBe('2026-07-01')
    expect(row.endsAt).toBe('2026-07-31')
  })
})
