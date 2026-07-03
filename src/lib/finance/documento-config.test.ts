import { describe, expect, it } from 'vitest'
import { computeDocumentoCommission, coerceDocumentoConfig, DEFAULT_DOCUMENTO_CONFIG, type DocumentoConfig } from '@/lib/finance/documento-config'

const cfg: DocumentoConfig = DEFAULT_DOCUMENTO_CONFIG

describe('computeDocumentoCommission', () => {
  it('loja paga → cortesia → 0 (vendedor e gerente)', () => {
    expect(computeDocumentoCommission({ config: cfg, fee: 1490, payer: 'LOJA', isManager: false })).toBe(0)
    expect(computeDocumentoCommission({ config: cfg, fee: 1490, payer: 'LOJA', isManager: true })).toBe(0)
  })

  it('pagador não confirmado (null) → 0 — conservador', () => {
    expect(computeDocumentoCommission({ config: cfg, fee: 1490, payer: null, isManager: false })).toBe(0)
    expect(computeDocumentoCommission({ config: cfg, fee: 1490, payer: undefined, isManager: true })).toBe(0)
    expect(computeDocumentoCommission({ config: cfg, fee: 1490, payer: '', isManager: false })).toBe(0)
  })

  it('exigirPagadorCliente=false → pagador desconhecido usa a faixa', () => {
    const c = { ...cfg, exigirPagadorCliente: false }
    expect(computeDocumentoCommission({ config: c, fee: 1490, payer: null, isManager: false })).toBe(200)
  })

  it('abaixo de R$990 → 0 para todos (cliente paga)', () => {
    expect(computeDocumentoCommission({ config: cfg, fee: 989.99, payer: 'CLIENTE', isManager: false })).toBe(0)
    expect(computeDocumentoCommission({ config: cfg, fee: 500, payer: 'CLIENTE', isManager: true })).toBe(0)
  })

  it('faixa 990–1489,99 → gerente 50 / vendedor 100 (cliente paga)', () => {
    expect(computeDocumentoCommission({ config: cfg, fee: 990, payer: 'CLIENTE', isManager: false })).toBe(100)
    expect(computeDocumentoCommission({ config: cfg, fee: 1200, payer: 'CLIENTE', isManager: true })).toBe(50)
    expect(computeDocumentoCommission({ config: cfg, fee: 1489.99, payer: 'CLIENTE', isManager: false })).toBe(100)
  })

  it('faixa 1490+ → gerente 100 / vendedor 200 (cliente paga)', () => {
    expect(computeDocumentoCommission({ config: cfg, fee: 1490, payer: 'CLIENTE', isManager: false })).toBe(200)
    expect(computeDocumentoCommission({ config: cfg, fee: 5000, payer: 'CLIENTE', isManager: true })).toBe(100)
  })

  it('config inativa → null (cai no modelo por regra)', () => {
    expect(computeDocumentoCommission({ config: { ...cfg, active: false }, fee: 1490, payer: 'CLIENTE', isManager: false })).toBeNull()
  })

  it('lojaPagaSemComissao=false + exigirPagadorCliente=false → loja paga usa a faixa', () => {
    const c = { ...cfg, lojaPagaSemComissao: false, exigirPagadorCliente: false }
    expect(computeDocumentoCommission({ config: c, fee: 1490, payer: 'LOJA', isManager: false })).toBe(200)
  })

  it('coerce ordena faixas, sanea valores e default exigirPagadorCliente=true', () => {
    const c = coerceDocumentoConfig({ tiers: [{ minFee: 1490, gerente: 100, vendedor: 200 }, { minFee: 990, maxFee: 1489.99, gerente: 50, vendedor: 100 }] })
    expect(c.tiers[0].minFee).toBe(990)
    expect(c.tiers[1].minFee).toBe(1490)
    expect(c.tiers[1].maxFee).toBeNull()
    expect(c.exigirPagadorCliente).toBe(true)
  })
})
