import { describe, expect, it } from 'vitest'
import { applySource, sourceToFields, vehicleYear, type DocSource } from './source-fields'
import { DOC_TEMPLATES } from './templates'

const src: DocSource = {
  loja: { tipo: 'PJ', nome: 'Auto Loja LTDA', documento: '12.345.678/0001-90', endereco: 'Rua A, 10, Centro, Curitiba/PR', representante: { nome: 'Fulano' } },
  cidade: 'Curitiba', uf: 'PR',
  parte: { tipo: 'PF', nome: 'Maria Souza', documento: '123.456.789-01', rg: '1234567', endereco: 'Rua B, 20', telefone: '41999990000', email: 'maria@x.com' },
  veiculo: { marca: 'Fiat', modelo: 'Argo', versao: 'Drive 1.0', anoFab: 2021, anoModelo: 2022, cor: 'Prata', placa: 'abc1d23', renavam: '00123456789', chassi: '9bd123', km: 35000, valor: 65900 },
  formaPagamento: 'Pix, Financiamento',
  outorgado: { nome: 'José Despachante', cpf: '987.654.321-00' },
}

describe('sourceToFields', () => {
  it('mapeia loja, parte, veículo, pagamento e outorgado para as chaves dos modelos', () => {
    const f = sourceToFields(src)
    expect(f).toMatchObject({
      empresa: 'Auto Loja LTDA', empresaDoc: '12.345.678/0001-90', empresaEndereco: 'Rua A, 10, Centro, Curitiba/PR', cidade: 'Curitiba/PR',
      clienteNome: 'Maria Souza', clienteCpf: '123.456.789-01', clienteRg: '1234567', outorganteNome: 'Maria Souza', outorganteEndereco: 'Rua B, 20',
      veiculo: 'Fiat Argo Drive 1.0', ano: '2021/2022', cor: 'Prata', placa: 'ABC1D23', renavam: '00123456789', chassi: '9BD123', km: '35.000',
      valor: '65.900,00', formaPagamento: 'Pix, Financiamento', outorgadoNome: 'José Despachante', outorgadoCpf: '987.654.321-00',
    })
  })

  it('PJ usa a IE no lugar do RG e omite campos vazios', () => {
    const f = sourceToFields({ parte: { tipo: 'PJ', nome: 'Parceiro SA', documento: '11.222.333/0001-44', ie: '123.456', rg: 'x' } })
    expect(f.clienteRg).toBe('123.456')
    expect(f).not.toHaveProperty('clienteEndereco')
    expect(f).not.toHaveProperty('empresa')
  })

  it('valor da origem tem prioridade sobre o do veículo', () => {
    expect(sourceToFields({ veiculo: { valor: 50000 }, valor: 52000 }).valor).toBe('52.000,00')
    expect(sourceToFields({ veiculo: { valor: 0 } })).not.toHaveProperty('valor')
  })

  it('cobre os campos de dados de todos os modelos', () => {
    const f = sourceToFields(src)
    const manual = new Set(['data', 'prazo', 'cobertura', 'observacoes', 'documentos'])
    for (const t of DOC_TEMPLATES) for (const fld of t.fields) if (!manual.has(fld.key)) expect(f, `${t.id}.${fld.key}`).toHaveProperty(fld.key)
  })
})

describe('applySource', () => {
  it('troca o bloco inteiro e preserva o resto', () => {
    const before = { ...sourceToFields(src), prazo: '3 meses', data: '01/10/2026' }
    const after = applySource(before, { parte: { tipo: 'PF', nome: 'João' } })
    expect(after.clienteNome).toBe('João')
    expect(after).not.toHaveProperty('clienteRg')
    expect(after.placa).toBe('ABC1D23')
    expect(after.prazo).toBe('3 meses')
    expect(after.data).toBe('01/10/2026')
  })
})

describe('vehicleYear', () => {
  it('fab/modelo quando diferentes', () => {
    expect(vehicleYear({ anoFab: 2022, anoModelo: 2022 })).toBe('2022')
    expect(vehicleYear({ anoFab: 2021 })).toBe('2021')
  })
})
