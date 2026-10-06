import { describe, expect, it } from 'vitest'
import { buildDre, categoryGroupResolver, guessDreGroup, resolveDreGroup, sourceDreGroup } from './dre-core'

describe('dre-core', () => {
  it('origem automática vira grupo da DRE', () => {
    expect(sourceDreGroup('NEG_PGTO_x', 'RECEITA')).toBe('REC_VEICULOS')
    expect(sourceDreGroup('VEICULO_COMPRA_VEICULO', 'DESPESA')).toBe('CMV_AQUISICAO')
    expect(sourceDreGroup('VEICULO_SERVICO', 'DESPESA')).toBe('CMV_PREPARACAO')
    expect(sourceDreGroup('COMISSAO', 'DESPESA')).toBe('DESP_COMISSOES')
    expect(sourceDreGroup('MANUAL', 'DESPESA')).toBeNull()
  })

  it('categoria filha herda o grupo do pai e vence a origem', () => {
    const g = categoryGroupResolver([{ id: 'p', parentId: null, dreGroup: 'DESP_OCUPACAO' }, { id: 'c', parentId: 'p', dreGroup: null }])
    expect(resolveDreGroup({ type: 'DESPESA', source: 'MANUAL', categoryId: 'c' }, g)).toBe('DESP_OCUPACAO')
    expect(resolveDreGroup({ type: 'DESPESA', source: 'COMISSAO', categoryId: null }, g)).toBe('DESP_COMISSOES')
    expect(resolveDreGroup({ type: 'RECEITA', source: null, categoryId: null }, g)).toBe('REC_OUTRAS')
  })

  it('monta subtotais e resultado; não operacional fica fora', () => {
    const dre = buildDre([
      { type: 'RECEITA', group: 'REC_VEICULOS', amount: 100000, period: '2026-10' },
      { type: 'DESPESA', group: 'DED_IMPOSTOS', amount: 2000, period: '2026-10' },
      { type: 'DESPESA', group: 'CMV_AQUISICAO', amount: 80000, period: '2026-10' },
      { type: 'DESPESA', group: 'DESP_OCUPACAO', amount: 5000, period: '2026-10' },
      { type: 'DESPESA', group: 'FIN_DESPESAS', amount: 1000, period: '2026-10' },
      { type: 'DESPESA', group: 'NAO_OPERACIONAL', amount: 50000, period: '2026-10' },
    ], ['2026-10'])
    const v = (k: string) => dre.find((l) => l.key === k)!.total
    expect(v('RECEITA_BRUTA')).toBe(100000)
    expect(v('RECEITA_LIQUIDA')).toBe(98000)
    expect(v('MARGEM_BRUTA')).toBe(18000)
    expect(v('EBITDA')).toBe(13000)
    expect(v('RESULTADO_LIQUIDO')).toBe(12000)
  })

  it('adivinha o grupo de categorias antigas pelo nome', () => {
    expect(guessDreGroup('Comissões — Retornos', 'DESPESA')).toBe('DESP_COMISSOES')
    expect(guessDreGroup('Serviços de preparação', 'DESPESA')).toBe('CMV_PREPARACAO')
    expect(guessDreGroup('Vendas', 'RECEITA')).toBe('REC_VEICULOS')
    expect(guessDreGroup('Aluguel', 'DESPESA')).toBe('DESP_OCUPACAO')
  })
})
