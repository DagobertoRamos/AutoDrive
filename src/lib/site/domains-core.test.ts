import { describe, it, expect } from 'vitest'
import { apexOf, isApex, cleanDomainInput, suggestHosts, expectedRecords, evaluateDns, sanitizeDomains, primaryDomain } from './domains-core'

describe('raiz e limpeza', () => {
  it('apex com sufixos .com.br e internacionais', () => {
    expect(apexOf('www.dagobertoeasycar.com.br')).toBe('dagobertoeasycar.com.br')
    expect(apexOf('loja.grupo.com.br')).toBe('grupo.com.br')
    expect(apexOf('www.loja.com')).toBe('loja.com')
    expect(apexOf('loja.co.uk')).toBe('loja.co.uk')
    expect(isApex('loja.com.br')).toBe(true)
    expect(isApex('www.loja.com.br')).toBe(false)
  })
  it('limpa URL colada', () => {
    expect(cleanDomainInput(' https://WWW.Loja.com.br/estoque?x=1 ')).toBe('www.loja.com.br')
  })
})

describe('sugestão de hosts', () => {
  it('raiz ou www → os dois, www principal', () => {
    expect(suggestHosts('loja.com.br')).toEqual({ hosts: ['www.loja.com.br', 'loja.com.br'], primary: 'www.loja.com.br' })
    expect(suggestHosts('https://www.loja.com.br')).toEqual({ hosts: ['www.loja.com.br', 'loja.com.br'], primary: 'www.loja.com.br' })
  })
  it('subdomínio → só ele', () => {
    expect(suggestHosts('seminovos.grupo.com.br')).toEqual({ hosts: ['seminovos.grupo.com.br'], primary: 'seminovos.grupo.com.br' })
  })
  it('inválido', () => {
    expect(suggestHosts('loja')).toHaveProperty('error')
    expect(suggestHosts('')).toHaveProperty('error')
  })
})

describe('registros esperados e avaliação', () => {
  const t = { a: '76.76.21.21', cname: 'cname.vercel-dns.com' }
  it('raiz = A @, www = CNAME www', () => {
    expect(expectedRecords('loja.com.br', t)).toEqual([{ type: 'A', name: '@', value: '76.76.21.21' }])
    expect(expectedRecords('www.loja.com.br', t)).toEqual([{ type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' }])
    expect(expectedRecords('seminovos.grupo.com.br', t)).toEqual([{ type: 'CNAME', name: 'seminovos', value: 'cname.vercel-dns.com' }])
  })
  it('conectado', () => {
    expect(evaluateDns('www.loja.com.br', { a: [], cname: ['cname.vercel-dns.com.'] }, t).status).toBe('CONNECTED')
    expect(evaluateDns('www.loja.com.br', { a: [], cname: ['d1d4fc829fe7bc7c.vercel-dns-017.com'] }, t).status).toBe('CONNECTED')
    expect(evaluateDns('loja.com.br', { a: ['76.76.21.21'], cname: [] }, t).status).toBe('CONNECTED')
    expect(evaluateDns('www.loja.com.br', { a: ['76.76.21.21'], cname: [] }, t).status).toBe('CONNECTED') // flattening
    // Pool anycast de projetos novos da Vercel.
    expect(evaluateDns('www.loja.com.br', { a: ['216.198.79.1', '64.29.17.1'], cname: [] }, t).status).toBe('CONNECTED')
    // Um IP antigo misturado com o da hospedagem ainda é problema.
    expect(evaluateDns('loja.com.br', { a: ['76.76.21.21', '148.224.63.68'], cname: [] }, t).status).toBe('PENDING_DNS')
  })
  it('explica o que está errado', () => {
    const r = evaluateDns('loja.com.br', { a: ['148.224.63.68'], cname: [] }, t)
    expect(r.status).toBe('PENDING_DNS')
    expect(r.message).toContain('148.224.63.68')
    expect(r.message).toContain('A 76.76.21.21')
    expect(evaluateDns('loja.com.br', { a: ['1.1.1.1', '2.2.2.2'], cname: [] }, t).message).toContain('apague os outros')
    expect(evaluateDns('www.loja.com.br', { a: [], cname: [], error: 'NOT_FOUND' }, t).message).toContain('Nenhum registro')
  })
})

describe('lista gravada', () => {
  it('aceita formato antigo e garante 1 principal (www)', () => {
    const d = sanitizeDomains(['loja.com.br', 'www.loja.com.br', 'lixo', 'www.loja.com.br'])
    expect(d.map((x) => x.host)).toEqual(['loja.com.br', 'www.loja.com.br'])
    expect(primaryDomain(d)?.host).toBe('www.loja.com.br')
    expect(d[0].records).toEqual([{ type: 'A', name: '@', value: '76.76.21.21' }])
  })
})
