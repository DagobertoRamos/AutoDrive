import { describe, expect, it } from 'vitest'
import { buildStatement, debtLabel, extenso, isInternalDebt, paymentLabel } from './statement-core'
import { renderIntermediationTerm, renderReservationTerm, renderSaleContract, type ContractData } from './documents-core'

describe('valor por extenso', () => {
  it.each([
    [1, 'um real'], [100, 'cem reais'], [1490, 'mil, quatrocentos e noventa reais'], [490, 'quatrocentos e noventa reais'],
    [105900, 'cento e cinco mil e novecentos reais'], [61890.5, 'sessenta e um mil, oitocentos e noventa reais e cinquenta centavos'],
    [1_000_000, 'um milhão de reais'], [3_250_000, 'três milhões, duzentos e cinquenta mil reais'], [0.01, 'um centavo'],
  ])('%s → %s', (v, txt) => expect(extenso(v)).toBe(txt))
})

describe('extrato da venda (dados do AutoConf)', () => {
  // Venda AC-731917: Voyage 61.890 + troca Sandero 41.314,82 com quitação de 31.894,82, documentação 1.490 paga pelo cliente.
  const input = {
    vehicleLabel: 'Veículo: VolksWagen VOYAGE — placa GHA-3C64', vehicleValue: 61890, documentationFee: 1490, documentationPaidBy: 'CLIENTE',
    debts: [
      { type: 'FINANCIAMENTO', value: '31894.82', description: 'Negociação #731917 - Débito do veículo: Quitação de financiamento Renault SANDERO Authentique, Placa: GBD-6337, Renavam: 01068858513 - Banco Pan S.A. (CPF/CNPJ: )', notes: 'Negociação #731917 - … — DESPESAS COM QUITAÇÃO VEICULOS' },
      { type: 'DOCUMENTACAO', value: '1490', description: 'Negociação #731917 - Débito do veículo: Documentação VolksWagen VOYAGE, Placa: GHA-3C64, Renavam: 1 - Easycar (CPF/CNPJ: 03.367.717/0001-64)', notes: 'x — DESPACHANTE' },
      { type: 'OUTROS', value: '65000', description: 'Negociação #731917 - Pix - fulano (CPF/CNPJ: 1) - Toyota', notes: 'x — CUSTO COM COMPRA' },
      { type: 'OUTROS', value: '75', description: 'Negociação #731917 - Débito do veículo: Perícia Fiat Palio, Placa: HIU-4217', notes: 'x — LAUDO CAUTELAR' },
    ],
    payments: [
      { type: 'CARTAO_CREDITO', status: 'CONFIRMADO', value: '51390', notes: 'Negociação #731917 - Financiamento - BANCO BRASILEIRO DE CRÉDITO S.A - VolksWagen' },
      { type: 'CARTAO_CREDITO', status: 'CONFIRMADO', value: '1348.31', notes: 'Negociação #731917 - BANCO BRASILEIRO DE CRÉDITO S.A - Retorno de financiamento - Veiculo' },
      { type: 'DINHEIRO', status: 'CONFIRMADO', value: '1490', notes: 'Negociação #731917 - Dinheiro - DIVA' },
      { type: 'PIX', status: 'CONFIRMADO', value: '590', notes: 'Pix' },
      { type: 'CARTAO_CREDITO', status: 'CONFIRMADO', value: '490', notes: 'Negociação #731917 - Cartão de crédito | 238115 | Mastercard - REDE - VolksWagen' },
      { type: 'PIX', status: 'CANCELADO', value: '999', notes: '' },
    ],
    tradeIns: [{ label: 'Renault SANDERO — placa GBD-6337', value: 41314.82 }],
  }
  const s = buildStatement(input)
  it('não mostra custo interno da loja, conta a documentação 1× e fecha com os pagamentos', () => {
    expect(s.itens.map((l) => l.descricao).join(' | ')).not.toMatch(/Pix - fulano|Perícia/)
    expect(s.itens.filter((l) => /Documenta/.test(l.descricao))).toHaveLength(1)
    expect(s.totalDevido).toBe(61890 + 31894.82 + 1490)
    expect(s.pagamentos.map((p) => p.forma)).toEqual(['Veículo na troca', 'Financiamento', 'Dinheiro', 'PIX', 'Cartão de crédito'])
    expect(s.pagamentos.some((p) => /Retorno/i.test(p.detalhe ?? ''))).toBe(false)
    expect(s.totalPago).toBe(41314.82 + 51390 + 1490 + 590 + 490)
    expect(s.saldo).toBe(0)
  })
  it('documentação em cortesia aparece mas não soma; desconto abate', () => {
    const c = buildStatement({ ...input, documentationPaidBy: 'LOJA', flatDiscount: 490, payments: [], tradeIns: [] })
    const doc = c.itens.find((l) => /Documenta/.test(l.descricao))!
    expect(doc).toMatchObject({ tipo: 'CORTESIA', valor: 1490 })
    expect(c.itens.at(-1)).toMatchObject({ tipo: 'DESCONTO', valor: 490 })
    expect(c.totalDevido).toBe(61890 + 31894.82 - 490)
  })
  it('taxa de documentação sem débito lançado vira linha própria (cortesia ou cobrada)', () => {
    const c = buildStatement({ vehicleLabel: 'Carro', vehicleValue: 50000, documentationFee: 1490, documentationPaidBy: 'LOJA', debts: [], payments: [] })
    expect(c.itens[1]).toMatchObject({ descricao: 'Documentação / transferência', tipo: 'CORTESIA' })
    expect(c.totalDevido).toBe(50000)
  })
  it('rótulos limpos de débitos e pagamentos', () => {
    expect(debtLabel({ type: 'MULTA', description: 'Negociação #720320 - Débito do veículo: Multa Toyota YARIS XL, Placa: EJH-0I52, Renavam: 012 - PREF. SP (CPF/CNPJ: 46.395.000/0001-39)' })).toBe('Multa — PREF. SP — placa EJH-0I52')
    expect(debtLabel({ type: 'IPVA', description: 'IPVA 2026', vehicleRole: 'TROCA' })).toBe('IPVA 2026 (veículo da troca)')
    expect(isInternalDebt({ notes: 'a — COMISSÃO DE COMPRAS' })).toBe(true)
    expect(paymentLabel({ type: 'CARTAO_CREDITO', notes: 'Negociação #1 - Cartão de crédito | 238115 | Mastercard - REDE' })).toEqual({ forma: 'Cartão de crédito', detalhe: 'Mastercard' })
  })
})

describe('documentos', () => {
  const base: ContractData = {
    numero: 'AC-731917', data: new Date('2026-10-02T15:00:00Z'), cidade: 'São Paulo', uf: 'SP', logoUrl: '/api/site/assets/abc',
    loja: { tipo: 'PJ', nome: 'AutoDrive Veículos LTDA', documento: '12.345.678/0001-90', endereco: 'Rua A, 1, São Paulo/SP', representante: { nome: 'Dagoberto Ramos', cpf: '111.222.333-44' } },
    comprador: { tipo: 'PF', nome: 'Diva <Capuano>', documento: '038.538.568-40', rg: null, endereco: 'Rua B, 2' },
    veiculo: { marca: 'VolksWagen', modelo: 'VOYAGE', placa: 'GHA-3C64', valor: 61890 },
    trocas: [{ marca: 'Renault', modelo: 'SANDERO', placa: 'GBD-6337', valor: 41314.82, quitacao: { banco: 'Banco Pan', valor: 31894.82 } }],
    extrato: buildStatement({ vehicleLabel: 'Veículo VOYAGE', vehicleValue: 61890, documentationFee: 1490, documentationPaidBy: 'LOJA', debts: [], payments: [{ type: 'PIX', status: 'CONFIRMADO', value: 20575.18 }], tradeIns: [{ label: 'SANDERO', value: 41314.82 }] }),
    sinal: { valor: 2000 }, financiado: true,
  }
  it('contrato: logo, partes, troca, quadros, cláusulas legais, assinaturas e escapa HTML', () => {
    const h = renderSaleContract(base)
    for (const t of ['CONTRATO PARTICULAR DE COMPRA E VENDA', '/api/site/assets/abc', 'VENDEDORA', 'COMPRADOR(A)', 'Do veículo dado na troca', 'Quadro de débitos', 'Cortesia — não cobrado', 'Quadro de pagamentos', 'art. 26, II', 'avaliação mecânica', 'laudo de vistoria cautelar', 'Lei nº 13.709/2018', 'art. 418', 'art. 123, §1º', 'art. 784, III', 'Testemunha 2', 'Termo de recebimento', 'sessenta e um mil, oitocentos e noventa reais', 'Financiamento.', 'Diva &lt;Capuano&gt;'])
      expect(h).toContain(t)
    expect(h).not.toContain('<Capuano>')
    expect(h).not.toContain('INTERMEDIADORA')
  })
  it('venda intermediada: dono como vendedor e loja como intermediadora', () => {
    const h = renderSaleContract({ ...base, proprietario: { tipo: 'PF', nome: 'João Dono', documento: '1' } })
    expect(h).toContain('INTERMEDIADORA')
    expect(h).toContain('João Dono')
    expect(h).not.toContain('garantia legal de <b>90')
  })
  it('termo de sinal: ciência da perda do sinal (art. 418) e devolução se financiamento recusado sem culpa', () => {
    const h = renderReservationTerm(base)
    expect(h).toMatch(/perderá o valor pago como sinal/)
    expect(h).toMatch(/posso perder o sinal pago em caso de desistência/)
    expect(h).toContain('sem culpa do COMPRADOR')
    expect(h).toMatch(/R\$\s2\.000,00 \(dois mil reais\)/)
  })
  it('termo de intermediação: corretagem (arts. 722–729), loja não é vendedora, três partes', () => {
    const h = renderIntermediationTerm({ ...base, proprietario: { tipo: 'PJ', nome: 'Loja Parceira', documento: '99.999.999/0001-99' }, comissao: '8% do valor da venda' })
    expect(h).toContain('arts. 722 a 729')
    expect(h).toContain('não é proprietária nem vendedora')
    expect(h).toContain('8% do valor da venda')
    expect(h).toContain('PROPRIETÁRIO(A)/VENDEDOR(A)')
  })
})

describe('veículo importado sem cadastro', () => {
  it('separa marca, modelo, combustível e ano; acha o RENAVAM nos débitos', async () => {
    const { parseVehicleText, renavamFromDebts, isStoreIncome } = await import('./statement-core')
    expect(parseVehicleText('VolksWagen VIRTUS TSI 1.0 Flex 12V 4p Aut. Flex 2025')).toEqual({ marca: 'VolksWagen', modelo: 'VIRTUS TSI 1.0 Flex 12V 4p Aut.', combustivel: 'Flex', anoModelo: 2025 })
    expect(renavamFromDebts('TKH3J81', [{ description: 'Negociação #1 - Débito do veículo: Documentação VW, Placa: TKH-3J81, Renavam: 01400000001 - X' }])).toBe('01400000001')
    expect(isStoreIncome({ notes: 'x — RECEITA COM VENDA FINANCIAMENTO' })).toBe(false)
    expect(isStoreIncome({ notes: 'x — RECEITA COM RETORNOS' })).toBe(true)
  })
})
