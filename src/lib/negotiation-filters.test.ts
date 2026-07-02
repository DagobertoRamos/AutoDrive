import { describe, expect, it } from 'vitest'
import { buildNegotiationFilterWhere, parseNegotiationFilters } from '@/lib/negotiation-filters'

describe('negotiation-filters', () => {
  it('normaliza periodo personalizado e valida data inicial maior que final', () => {
    const parsed = parseNegotiationFilters(new URLSearchParams('periodMode=custom&dateFrom=2026-07-31&dateTo=2026-07-01'))

    expect(parsed.errors[0]).toBe('Data inicial não pode ser maior que a data final.')
  })

  it('monta filtro mensal a partir de mes especifico', () => {
    const parsed = parseNegotiationFilters(new URLSearchParams('periodMode=specificMonth&month=7&year=2026'))
    const where = buildNegotiationFilterWhere(parsed.filters)

    expect(parsed.filters.dateFrom).toBe('2026-07-01')
    expect(parsed.filters.dateTo).toBe('2026-07-31')
    expect(where).toMatchObject({ AND: [{ createdAt: { gte: expect.any(Date), lte: expect.any(Date) } }] })
  })

  it('ignora status e tipo inexistentes', () => {
    const parsed = parseNegotiationFilters(new URLSearchParams('status=FINALIZADA&status=INVENTADO&type=VENDA&type=FAKE'))

    expect(parsed.filters.statuses).toEqual(['FINALIZADA'])
    expect(parsed.filters.types).toEqual(['VENDA'])
  })

  it('busca placa com variante sem hifen e com hifen', () => {
    const parsed = parseNegotiationFilters(new URLSearchParams('search=abc1d23'))
    const where = buildNegotiationFilterWhere(parsed.filters)
    const serialized = JSON.stringify(where)

    expect(serialized).toContain('ABC1D23')
    expect(serialized).toContain('ABC-1D23')
  })

  it('filtra pendencias abertas sem misturar com permissoes', () => {
    const parsed = parseNegotiationFilters(new URLSearchParams('pendency=open'))
    const where = buildNegotiationFilterWhere(parsed.filters)

    expect(where).toMatchObject({ AND: [{ pendencies: { some: { status: { in: ['ABERTA', 'EM_ANDAMENTO'] } } } }] })
  })
})
