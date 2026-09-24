import { describe, it, expect } from 'vitest'
import { deviceOf, isBot, sectionOf, sitePath, sourceOf } from './analytics-core'

describe('contador de visitas', () => {
  it('caminho relativo e seção', () => {
    expect(sitePath('/s/minha-loja', 'minha-loja')).toBe('/')
    expect(sitePath('/s/minha-loja/veiculos', 'minha-loja')).toBe('/veiculos')
    expect(sitePath('/contato', 'www.loja.com.br')).toBe('/contato')
    expect(sectionOf('/')).toEqual({ section: 'home', vehicleId: null })
    expect(sectionOf('/veiculos')).toEqual({ section: 'estoque', vehicleId: null })
    expect(sectionOf('/veiculos/vw-t-cross-2023--cmabc12345')).toEqual({ section: 'veiculo', vehicleId: 'cmabc12345' })
    expect(sectionOf('/financiamento').section).toBe('financiamento')
    expect(sectionOf('/xpto').section).toBe('outros')
  })
  it('origem da visita', () => {
    const p = (q: string) => new URLSearchParams(q)
    expect(sourceOf('', 'loja.com.br', p('gclid=1'))).toBe('google_ads')
    expect(sourceOf('', 'loja.com.br', p('utm_source=instagram&utm_medium=paid'))).toBe('meta_ads')
    expect(sourceOf('https://www.google.com/', 'loja.com.br', p(''))).toBe('google')
    expect(sourceOf('https://l.instagram.com/', 'loja.com.br', p(''))).toBe('meta')
    expect(sourceOf('https://www.loja.com.br/x', 'www.loja.com.br', p(''))).toBe('interno')
    expect(sourceOf('', 'loja.com.br', p(''))).toBe('direto')
  })
  it('aparelho e robô', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile')).toBe('celular')
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('computador')
    expect(isBot('Googlebot/2.1')).toBe(true)
    expect(isBot('Mozilla/5.0 (Windows NT 10.0)')).toBe(false)
  })
})
