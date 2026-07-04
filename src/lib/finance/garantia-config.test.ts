import { describe, expect, it } from 'vitest'
import { computeGarantiaCommission, coerceGarantiaConfig, matchGarantiaProduto, DEFAULT_GARANTIA_CONFIG, type GarantiaConfig } from '@/lib/finance/garantia-config'

const cfg: GarantiaConfig = {
  ...DEFAULT_GARANTIA_CONFIG,
  produtos: [
    { match: '150ex 2anos', valorCobrado: 3350, gerente: 100, vendedor: 200 },
    { match: '150ex 3anos', valorCobrado: 3900, gerente: 150, vendedor: 300 },
  ],
  defaultGerente: 50,
  defaultVendedor: 80,
}

describe('computeGarantiaCommission', () => {
  it('cliente paga + produto casado → comissão do produto', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: 'Gestauto - +150EX 2anos', payer: 'CLIENTE', isManager: false })).toBe(200)
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', payer: 'CLIENTE', isManager: true })).toBe(100)
  })

  it('casa o produto mais específico (3anos ≠ 2anos)', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: 'Gestauto +150EX 3anos', payer: 'CLIENTE', isManager: false })).toBe(300)
  })

  it('loja paga → cortesia → 0', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', payer: 'LOJA', isManager: false })).toBe(0)
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', payer: 'LOJA', isManager: true })).toBe(0)
  })

  it('produto não cadastrado → default', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: 'Produto Desconhecido XYZ', payer: 'CLIENTE', isManager: false })).toBe(80)
    expect(computeGarantiaCommission({ config: cfg, produto: 'Produto Desconhecido XYZ', payer: 'CLIENTE', isManager: true })).toBe(50)
  })

  it('config inativa → null (cai no modelo por regra)', () => {
    expect(computeGarantiaCommission({ config: { ...cfg, active: false }, produto: '+150EX 2anos', payer: 'CLIENTE', isManager: false })).toBeNull()
  })

  it('lojaPagaSemComissao=false → loja paga também comissiona', () => {
    expect(computeGarantiaCommission({ config: { ...cfg, lojaPagaSemComissao: false }, produto: '+150EX 2anos', payer: 'LOJA', isManager: false })).toBe(200)
  })

  it('matchGarantiaProduto casa por acento/caixa', () => {
    expect(matchGarantiaProduto(cfg, 'GESTAUTO — +150ex 2ANOS')?.gerente).toBe(100)
    expect(matchGarantiaProduto(cfg, 'nada a ver')).toBeNull()
  })

  it('coerce descarta produtos sem match e sanea valores', () => {
    const c = coerceGarantiaConfig({ produtos: [{ match: '', gerente: 10, vendedor: 20 }, { match: 'ex', gerente: -5, vendedor: 30 }] })
    expect(c.produtos.length).toBe(1)
    expect(c.produtos[0].gerente).toBe(0)
    expect(c.produtos[0].vendedor).toBe(30)
  })
})
