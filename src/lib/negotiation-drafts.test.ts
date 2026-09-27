import { describe, expect, it } from 'vitest'
import { cleanDraftInput, draftStepLabel, draftTitle, isDraftManager } from './negotiation-drafts'

describe('rascunho de negociação', () => {
  it('valida e normaliza a entrada', () => {
    expect(cleanDraftInput(null)).toMatchObject({ ok: false })
    expect(cleanDraftInput({ step: 2 })).toMatchObject({ ok: false })
    const r = cleanDraftInput({ data: { a: 1 }, step: 99, type: 'CONSIGNACAO', title: '  João · Uno  ' })
    expect(r).toEqual({ ok: true, data: { data: { a: 1 }, step: 7, type: 'CONSIGNACAO', title: 'João · Uno' } })
    expect(cleanDraftInput({ data: { a: 1 }, type: 'XYZ' })).toMatchObject({ ok: true, data: { type: null, step: 0 } })
    expect(cleanDraftInput({ data: { big: 'x'.repeat(300 * 1024) } })).toMatchObject({ ok: false })
  })
  it('rótulo da etapa e resumo', () => {
    expect(draftStepLabel(2)).toBe('Veículos')
    expect(draftTitle({ nomeCompleto: 'Maria', vehicle: { brand: 'Fiat', model: 'Uno', plate: 'ABC1D23' } })).toBe('Maria · Fiat Uno ABC1D23')
    expect(draftTitle({})).toBeNull()
  })
  it('gestores veem os rascunhos da loja', () => {
    expect(isDraftManager('GERENTE')).toBe(true)
    expect(isDraftManager('VENDEDOR')).toBe(false)
  })
})
