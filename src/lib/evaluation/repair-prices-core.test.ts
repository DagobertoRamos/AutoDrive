import { describe, expect, it } from 'vitest'
import { DEFAULT_REPAIRS, diffRepairs, normalizeRepairs, repairTotal, repairsForSection } from './repair-prices-core'

describe('tabela de reparos da avaliação', () => {
  it('valida nome e valor, gera chave e filtra seções inválidas', () => {
    expect(normalizeRepairs([{ label: '', price: 10 }])).toMatchObject({ ok: false, error: 'Informe o nome do reparo (linha 1).' })
    expect(normalizeRepairs([{ label: 'X', price: -1 }])).toMatchObject({ ok: false })
    expect(normalizeRepairs([{ label: 'X', price: 10, active: false }])).toMatchObject({ ok: false, error: 'Deixe ao menos um reparo ativo.' })
    const r = normalizeRepairs([{ label: 'Martelinho de Ouro', price: '250.5', sections: ['FRENTE', 'XYZ'] }, { label: 'Martelinho de Ouro', price: 1 }])
    expect(r.ok && r.data.map((x) => [x.key, x.price, x.sections])).toEqual([['martelinho_de_ouro', 250.5, ['FRENTE']], ['martelinho_de_ouro_2', 1, []]])
  })

  it('avaliador vê só os reparos ativos da seção (ou de todas)', () => {
    const keys = (s: string) => repairsForSection(DEFAULT_REPAIRS, s).map((r) => r.key)
    expect(keys('FRENTE')).toContain('martelinho')
    expect(keys('FRENTE')).toContain('troca_peca') // sem seção = todas
    expect(keys('INTERIOR')).not.toContain('martelinho')
    expect(keys('INTERIOR')).toContain('higienizacao')
  })

  it('valor multiplica pelas posições e o log descreve as mudanças', () => {
    expect(repairTotal(450, 2)).toBe(900)
    expect(repairTotal(450, 0)).toBe(450)
    const after = DEFAULT_REPAIRS.map((r) => (r.key === 'martelinho' ? { ...r, price: 300 } : r)).filter((r) => r.key !== 'polimento')
    const changes = diffRepairs(DEFAULT_REPAIRS, [...after, { key: 'vidro', label: 'Troca de vidro', serviceType: 'TROCA_PECA', price: 700, sections: [], active: true, order: 1 }])
    expect(changes).toEqual(['"Martelinho de ouro": R$ 250,00 → R$ 300,00', 'Incluído "Troca de vidro" (R$ 700,00)', 'Excluído "Polimento localizado"'].map((s) => s.replace(/ /g, '\u00a0').replace(/\u00a0/g, ' ')).map((s) => expect.stringMatching(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/R\\\$ /g, 'R\\$\\s'))))
  })
})
