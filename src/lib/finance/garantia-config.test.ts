import { describe, expect, it } from 'vitest'
import { computeGarantiaCommission, resolveGarantiaTier, matchGarantiaProduto, coerceGarantiaConfig, DEFAULT_GARANTIA_CONFIG, type GarantiaConfig } from '@/lib/finance/garantia-config'

const cfg: GarantiaConfig = {
  ...DEFAULT_GARANTIA_CONFIG,
  produtos: [
    { match: '150ex 2anos', valorCheia: 3350, vendedorCheia: 700, vendedorDesconto: 350, gerente: 100 },
    { match: '150ex 1ano', valorCheia: 2790, vendedorCheia: 500, vendedorDesconto: 250, gerente: 100 },
  ],
  defaultGerente: 100,
  defaultVendedorCheia: 0,
  defaultVendedorDesconto: 0,
}

describe('computeGarantiaCommission (cheia/desconto por valor)', () => {
  it('cliente paga valor cheio → comissão CHEIA do vendedor', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: 'Gestauto - +150EX 2anos', valorCobrado: 3350, payer: 'CLIENTE', isManager: false })).toBe(700)
  })

  it('cliente paga abaixo do cheio → comissão DESCONTO', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', valorCobrado: 2500, payer: 'CLIENTE', isManager: false })).toBe(350)
  })

  it('gerente é fixo por garantia (independe de cheia/desconto)', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', valorCobrado: 3350, payer: 'CLIENTE', isManager: true })).toBe(100)
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', valorCobrado: 2000, payer: 'CLIENTE', isManager: true })).toBe(100)
  })

  it('override manual força o tier', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', valorCobrado: 3350, payer: 'CLIENTE', isManager: false, forceTier: 'DESCONTO' })).toBe(350)
  })

  it('sem valorCheia de referência → padrão CHEIA', () => {
    const c = { ...cfg, produtos: [{ match: '150ex 2anos', valorCheia: null, vendedorCheia: 700, vendedorDesconto: 350, gerente: 100 }] }
    expect(computeGarantiaCommission({ config: c, produto: '+150EX 2anos', valorCobrado: 1000, payer: 'CLIENTE', isManager: false })).toBe(700)
  })

  it('loja paga → cortesia → 0 (vendedor e gerente)', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', valorCobrado: 3350, payer: 'LOJA', isManager: false })).toBe(0)
    expect(computeGarantiaCommission({ config: cfg, produto: '+150EX 2anos', valorCobrado: 3350, payer: 'LOJA', isManager: true })).toBe(0)
  })

  it('produto não cadastrado → defaults', () => {
    expect(computeGarantiaCommission({ config: cfg, produto: 'produto xyz', valorCobrado: 1000, payer: 'CLIENTE', isManager: false })).toBe(0)
    expect(computeGarantiaCommission({ config: cfg, produto: 'produto xyz', valorCobrado: 1000, payer: 'CLIENTE', isManager: true })).toBe(100)
  })

  it('config inativa → null', () => {
    expect(computeGarantiaCommission({ config: { ...cfg, active: false }, produto: '+150EX 2anos', valorCobrado: 3350, payer: 'CLIENTE', isManager: false })).toBeNull()
  })

  it('resolveGarantiaTier: limite exato conta como cheia', () => {
    expect(resolveGarantiaTier({ produto: cfg.produtos[0], valorCobrado: 3350 })).toBe('CHEIA')
    expect(resolveGarantiaTier({ produto: cfg.produtos[0], valorCobrado: 3349.98 })).toBe('DESCONTO')
  })

  it('matchGarantiaProduto casa o mais específico e por acento/caixa', () => {
    expect(matchGarantiaProduto(cfg, 'GESTAUTO — +150ex 2ANOS')?.vendedorCheia).toBe(700)
    expect(matchGarantiaProduto(cfg, 'nada a ver')).toBeNull()
  })

  it('matchGarantiaProduto por TOKENS (não contíguo): "100 2anos" casa "+100PR 2anos"', () => {
    const c: GarantiaConfig = { ...DEFAULT_GARANTIA_CONFIG, produtos: [
      { match: '100 2anos', valorCheia: null, vendedorCheia: 500, vendedorDesconto: 250, gerente: 100 },
      { match: '150ex 2anos', valorCheia: null, vendedorCheia: 700, vendedorDesconto: 350, gerente: 100 },
    ] }
    expect(matchGarantiaProduto(c, 'Gestauto - +100PR 2anos')?.vendedorCheia).toBe(500)
    expect(matchGarantiaProduto(c, 'Gestauto - +150EX 2anos')?.vendedorCheia).toBe(700)
    expect(matchGarantiaProduto(c, 'Gestauto - +100PR 1ano')).toBeNull() // 2anos ausente
  })

  it('coerce descarta produtos sem match e sanea', () => {
    const c = coerceGarantiaConfig({ produtos: [{ match: '', gerente: 10 }, { match: 'ex', vendedorCheia: -5, vendedorDesconto: 20 }] })
    expect(c.produtos.length).toBe(1)
    expect(c.produtos[0].vendedorCheia).toBe(0)
    expect(c.produtos[0].vendedorDesconto).toBe(20)
  })
})
