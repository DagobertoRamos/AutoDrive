import { describe, expect, it } from 'vitest'
import { buildStatement } from './statement-core'
import { renderEntregaTroca, renderEntregaVenda, renderProcMultasTroca, renderProcMultasVenda, renderProcTroca, renderProcVenda } from './proxies-core'
import { sanitizeDocSettings } from './doc-settings-core'
import type { ContractData } from './documents-core'

const base: ContractData = {
  numero: 'NEG-2026-0003', data: new Date('2026-10-03T15:00:00Z'), cidade: 'Barueri', uf: 'SP', logoUrl: '/api/site/assets/logo1',
  loja: { tipo: 'PJ', nome: 'AutoDrive Veículos LTDA', documento: '00.000.000/0001-00', endereco: 'Av. Teste, 100, Barueri/SP' },
  comprador: { tipo: 'PF', nome: 'Cliente Teste', documento: '123.456.789-09', rg: '12.345.678-9', endereco: 'Rua B, 2, Osasco/SP' },
  veiculo: { marca: 'Hyundai', modelo: 'HB20', placa: 'GHM4F38', renavam: '01234567890', valor: 55890 },
  trocas: [], entrada: [{ marca: 'VW', modelo: 'VOYAGE', placa: 'EGF8G77', anoModelo: 2009 }],
  extrato: buildStatement({ vehicleLabel: 'HB20', vehicleValue: 55890, debts: [], payments: [] }),
  outorgados: [{ nome: 'Dagoberto Ramos', cpf: '111.222.333-44', rg: '22.333.444-5', orgaoRg: 'SSP/SP', nacionalidade: 'brasileiro', estadoCivil: 'casado', profissao: 'empresário', endereco: 'Rua C, 3, Barueri/SP' }, { nome: 'Despachante X', cpf: '555.666.777-88' }],
  validadeProcuracaoDias: 180, firmaReconhecida: true,
}

describe('procurações e termos de entrega', () => {
  it('procuração do veículo vendido: comprador outorga, assina campos de comprador e vendedor, validade e firma', () => {
    const h = renderProcVenda(base)
    for (const t of ['PROCURAÇÃO PARTICULAR — VEÍCULO ADQUIRIDO', 'OUTORGANTE', 'Cliente Teste', 'Dagoberto Ramos', 'Despachante X', 'em conjunto ou separadamente', 'nos campos de COMPRADOR e de VENDEDOR', 'GHM4F38', '180 (cento e oitenta) dias', 'art. 654, §2º', 'substabelecer', '/api/site/assets/logo1']) expect(h).toContain(t)
  })
  it('procuração da troca: em causa própria, irrevogável (arts. 684/685), vender a si mesmos (art. 117)', () => {
    const h = renderProcTroca(base)
    for (const t of ['EM CAUSA PRÓPRIA', 'irrevogável e irretratável', 'arts. 684 e 685', 'art. 117', 'EGF8G77', 'baixa de alienação fiduciária', 'NEG-2026-0003']) expect(h).toContain(t)
  })
  it('indicação de condutor: CTB 257 §7º, período certo para venda e troca, ciência dos pontos', () => {
    const v = renderProcMultasVenda(base); const t = renderProcMultasTroca(base)
    for (const h of [v, t]) for (const s of ['art. 257, §7º', 'Resolução CONTRAN nº 918/2022', 'ciente de que a pontuação', 'CNH do OUTORGANTE']) expect(h).toContain(s)
    expect(v).toContain('a partir da data e hora em que o veículo lhe foi entregue')
    expect(v).toContain('GHM4F38')
    expect(t).toContain('até a data e hora em que o veículo foi entregue')
    expect(t).toContain('EGF8G77')
  })
  it('termos de entrega: data/hora/km, checklist, responsabilidade e transferência em 30 dias', () => {
    const v = renderEntregaVenda(base); const t = renderEntregaTroca(base)
    for (const s of ['TERMO DE ENTREGA E RESPONSABILIDADE — VEÍCULO VENDIDO', 'chave reserva', 'art. 1.267', '30 (trinta) dias', 'comunicação de venda', 'Testemunha 1']) expect(v).toContain(s)
    for (const s of ['VEÍCULO ENTREGUE À LOJA', 'ATPV-e/CRV assinado', 'busca e apreensão', 'vícios ocultos e pela evicção', 'até a data e hora da entrega']) expect(t).toContain(s)
  })
  it('sem outorgados: campo do procurador em branco', () => {
    expect(renderProcVenda({ ...base, outorgados: [] })).toMatch(/OUTORGADO\(S\):/)
  })
})

describe('configurações dos documentos', () => {
  it('limpa e valida outorgados e validade', () => {
    const s = sanitizeDocSettings({ outorgados: [{ nome: '  João  ', cpf: '111.222.333-44' }, { nome: '' }], validadeProcuracaoDias: 5000, uf: 'sp' })
    expect(s.outorgados).toHaveLength(1)
    expect(s.outorgados[0]).toMatchObject({ nome: 'João', cpf: '11122233344', ativo: true, nacionalidade: 'brasileiro(a)' })
    expect(s.validadeProcuracaoDias).toBe(730)
    expect(s.uf).toBe('SP')
  })
})
