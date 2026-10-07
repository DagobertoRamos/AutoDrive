import { describe, expect, it } from 'vitest'
import { COMMON_REQUIRED, missingFields, missingForBanks, missingMessage, sanitizeFieldList } from './fields-core'

const pf = {
  personType: 'PF', nomeCompleto: 'João Silva', cpf: '52998224725', dataNascimento: new Date('1990-01-01'), celular: '11999999999',
  cep: '06400000', logradouro: 'Rua A', numero: '10', cidade: 'Barueri', estado: 'SP', occupation: 'CLT', renda: '5000.00',
}

describe('ficha universal', () => {
  it('PF completa no conjunto comum', () => {
    expect(missingFields(pf, COMMON_REQUIRED.PF, 'PF')).toEqual([])
  })
  it('PJ tem conjunto próprio (sem improvisar com campos de PF)', () => {
    const miss = missingFields({ razaoSocial: 'ACME LTDA' }, COMMON_REQUIRED.PJ, 'PJ').map((f) => f.key)
    expect(miss).toContain('cnpj')
    expect(miss).toContain('faturamentoMensal')
    expect(miss).not.toContain('cpf')
  })
  it('renda zero conta como não informada', () => {
    expect(missingFields({ ...pf, renda: 0 }, ['renda'], 'PF').map((f) => f.key)).toEqual(['renda'])
  })
  it('mostra só o que falta para cada banco escolhido', () => {
    const r = missingForBanks(pf, 'PF', [
      { bankId: 's', bankName: 'Santander', extraFields: ['nomeMae', 'estadoCivil', 'renda'] },
      { bankId: 'b', bankName: 'BV', extraFields: [] },
    ])
    expect(r.common).toEqual([])
    expect(r.byBank[0].missing.map((f) => f.key)).toEqual(['nomeMae', 'estadoCivil'])
    expect(r.byBank[1].missing).toEqual([])
    expect(missingMessage('Santander', 2)).toBe('Precisamos de mais 2 informações para enviar ao Santander.')
    expect(missingMessage('Santander', 1)).toBe('Precisamos de mais 1 informação para enviar ao Santander.')
  })
  it('lista configurada pela loja só aceita campos conhecidos', () => {
    expect(sanitizeFieldList(['nomeMae', 'qualquer', 'nomeMae', 3])).toEqual(['nomeMae'])
    expect(sanitizeFieldList('x')).toEqual([])
  })
})
