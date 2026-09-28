import { describe, expect, it } from 'vitest'
import { CATALOG_SIZE, cleanOptions, groupOptions, OPTION_CATALOG, optionInfo, searchOptions } from './options-catalog'

describe('catálogo de opcionais', () => {
  it('16 grupos na ordem combinada e centenas de itens sem repetição', () => {
    expect(OPTION_CATALOG.map((g) => g.group)).toEqual([
      'Segurança', 'ADAS', 'Conforto', 'Climatização', 'Bancos', 'Multimídia', 'Conectividade', 'Iluminação',
      'Exterior', 'Interior', 'Rodas/Pneus', 'Motor/Câmbio', 'Tração/Off-road', 'Elétricos/Híbridos', 'Acessórios', 'Estado/Histórico',
    ])
    expect(CATALOG_SIZE).toBeGreaterThan(700)
  })
  it('separa equipamento, acessório e estado/histórico', () => {
    expect(optionInfo('Teto solar')?.kind).toBe('EQUIPAMENTO')
    expect(optionInfo('capota marítima')?.kind).toBe('ACESSORIO')
    expect(optionInfo('Película automotiva')?.kind).toBe('ACESSORIO')
    expect(optionInfo('IPVA pago')?.kind).toBe('HISTORICO')
    expect(optionInfo('Controle de cruzeiro adaptativo – ACC')?.group).toBe('ADAS')
  })
  it('normaliza grafia e remove repetidos, mantendo itens livres', () => {
    expect(cleanOptions(['apple carplay', 'Apple CarPlay', ' ', 'Kit multimídia do cliente'])).toEqual(['Apple CarPlay', 'Kit multimídia do cliente'])
    expect(cleanOptions('Bancos em couro, câmera de ré')).toEqual(['Bancos em couro', 'Câmera de ré'])
  })
  it('busca sem acento e por várias palavras', () => {
    expect(searchOptions('camera re').map((o) => o.name)).toContain('Câmera de ré')
    expect(searchOptions('carplay sem fio').map((o) => o.name)).toEqual(['Apple CarPlay sem fio'])
  })
  it('agrupa para exibição na ordem do catálogo, livres em Outros', () => {
    expect(groupOptions(['IPVA pago', 'Bancos em couro', 'ABS', 'Coisa livre'])).toEqual([
      { group: 'Segurança', items: ['ABS'] },
      { group: 'Bancos', items: ['Bancos em couro'] },
      { group: 'Estado/Histórico', items: ['IPVA pago'] },
      { group: 'Outros', items: ['Coisa livre'] },
    ])
  })
})

describe('Opcionais a partir do cadastro', () => {
  it('marca o que está escrito na versão, descrição e avaliação — e só isso', async () => {
    const { inferOptions } = await import('./options-catalog')
    const got = inferOptions(['Evolut. Flex 1.0 Tb 12v 5p Aut.', 'Carro com ar condicionado, dir. hidráulica, vidros elétricos, travas elétricas, rodas de liga leve e câmera de ré. Único dono, IPVA pago. Veículo periciado.', null])
    expect(got).toEqual(expect.arrayContaining(['Ar-condicionado', 'Direção hidráulica', 'Vidros elétricos dianteiros', 'Travas elétricas', 'Rodas de liga leve', 'Câmera de ré', 'Único dono', 'IPVA pago', 'Laudo cautelar aprovado']))
    expect(got).not.toContain('Direção')
    expect(inferOptions(['Palio 1.0 Celebr. ECONOMY F.Flex 8V 2p · Cor Branco · Câmbio Manual'])).toEqual([])
    expect(inferOptions(['Teto solar panorâmico, Apple CarPlay e Android Auto, bancos de couro'])).toEqual(expect.arrayContaining(['Teto solar panorâmico', 'Apple CarPlay', 'Android Auto', 'Bancos em couro']))
  })
})
