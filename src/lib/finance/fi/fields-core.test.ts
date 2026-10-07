import { describe, expect, it } from 'vitest'
import { COMMON_REQUIRED, commonRequiredFor, missingFields, missingForBanks, missingMessage, sanitizeFieldList, SIMULATION_REQUIRED } from './fields-core'
import { normalizeField } from './field-input'

const pf = {
  personType: 'PF', nomeCompleto: 'João Silva', cpf: '52998224725', dataNascimento: new Date('1990-01-01'), sexo: 'M', estadoCivil: 'SOLTEIRO',
  nacionalidade: 'Brasileira', naturalidade: 'São Paulo', naturalidadeUf: 'SP', pep: 'NAO', rg: '123456789', rgOrgao: 'SSP', rgUf: 'SP',
  rgDataEmissao: new Date('2010-01-01'), nomeMae: 'Maria Silva', nomePai: 'NÃO DECLARADO', celular: '11999999999', email: 'joao@exemplo.com',
  cep: '06400000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Barueri', estado: 'SP', tipoResidencia: 'PROPRIA', tempoResidenciaMeses: 0,
  occupation: 'APOSENTADO_PENSIONISTA', profissao: 'Aposentado', renda: '5000.00', numeroBeneficio: '1234567890',
}

describe('ficha universal', () => {
  it('PF completa no conjunto comum (tempo zero conta como resposta)', () => {
    expect(missingFields(pf, commonRequiredFor(pf, 'PF'), 'PF')).toEqual([])
  })
  it('simulação exige e-mail', () => {
    expect(SIMULATION_REQUIRED.PF).toContain('email')
    expect(SIMULATION_REQUIRED.PJ).toContain('email')
  })
  it('condicionais: CLT pede empresa, casado pede cônjuge, aluguel pede valor', () => {
    const req = commonRequiredFor({ ...pf, occupation: 'CLT', estadoCivil: 'CASADO', tipoResidencia: 'ALUGADA' }, 'PF')
    expect(req).toEqual(expect.arrayContaining(['empresaNome', 'empresaTelefone', 'dataAdmissao', 'empresaCep', 'conjugeNome', 'conjugeCpf', 'valorAluguel']))
    expect(req).not.toContain('numeroBeneficio')
  })
  it('PJ tem conjunto próprio com sócios e representante', () => {
    const miss = missingFields({ razaoSocial: 'ACME LTDA' }, COMMON_REQUIRED.PJ, 'PJ').map((f) => f.key)
    expect(miss).toEqual(expect.arrayContaining(['cnpj', 'faturamentoMensal', 'socios', 'representanteCpf', 'naturezaJuridica']))
    expect(miss).not.toContain('cpf')
  })
  it('renda zero conta como não informada', () => {
    expect(missingFields({ ...pf, renda: 0 }, ['renda'], 'PF').map((f) => f.key)).toEqual(['renda'])
  })
  it('mostra só o que falta para cada banco escolhido', () => {
    const r = missingForBanks(pf, 'PF', [
      { bankId: 's', bankName: 'Santander', extraFields: ['cnh', 'escolaridade', 'renda'] },
      { bankId: 'b', bankName: 'BV', extraFields: [] },
    ])
    expect(r.common).toEqual([])
    expect(r.byBank[0].missing.map((f) => f.key)).toEqual(['cnh', 'escolaridade'])
    expect(r.byBank[1].missing).toEqual([])
    expect(missingMessage('Santander', 2)).toBe('Precisamos de mais 2 informações para enviar ao Santander.')
    expect(missingMessage('Santander', 1)).toBe('Precisamos de mais 1 informação para enviar ao Santander.')
  })
  it('lista configurada pela loja só aceita campos conhecidos', () => {
    expect(sanitizeFieldList(['nomeMae', 'qualquer', 'nomeMae', 3])).toEqual(['nomeMae'])
    expect(sanitizeFieldList('x')).toEqual([])
  })
})

describe('validação de campos', () => {
  it('sócios: CPF/CNPJ válidos e soma 100%', () => {
    const ok = normalizeField('socios', [
      { nome: 'Ana', documento: '529.982.247-25', participacao: '60', assina: 'SIM' },
      { nome: 'Holding', documento: '11.222.333/0001-81', participacao: '40,0' },
    ])
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value).toEqual([
      { nome: 'Ana', documento: '52998224725', participacao: 60, assina: 'SIM' },
      { nome: 'Holding', documento: '11222333000181', participacao: 40 },
    ])
    const bad = normalizeField('socios', [{ nome: 'Ana', documento: '52998224725', participacao: 50 }])
    expect(bad.ok).toBe(false)
    expect(normalizeField('socios', [{ nome: 'Ana', documento: '12345678900', participacao: 100 }]).ok).toBe(false)
    expect(normalizeField('socios', [{ nome: 'Ana', cpf: '52998224725', participacao: 100 }]).ok).toBe(true) // formato antigo
  })
  it('número curto, telefone, UF, percentual e datas', () => {
    expect(normalizeField('numero', '5')).toEqual({ ok: true, value: '5' })
    expect(normalizeField('empresaTelefone', '(11) 3333-4444')).toEqual({ ok: true, value: '1133334444' })
    expect(normalizeField('rgUf', 'sp')).toEqual({ ok: true, value: 'SP' })
    expect(normalizeField('participacaoEmpresa', '33,5')).toEqual({ ok: true, value: 33.5 })
    expect(normalizeField('participacaoEmpresa', '150').ok).toBe(false)
    expect(normalizeField('dataAdmissao', '2999-01-01').ok).toBe(false)
    expect(normalizeField('rgDataEmissao', '31/02/2010').ok).toBe(false)
    expect(normalizeField('conjugeCpf', '52998224725')).toEqual({ ok: true, value: '52998224725' })
    expect(normalizeField('pep', 'TALVEZ').ok).toBe(false)
  })
})
