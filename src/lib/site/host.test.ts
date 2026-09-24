import { describe, it, expect } from 'vitest'
import { resolveSiteHost, normalizeHost } from './host'

const env = { appHosts: 'app.autodrive.com.br, auto-drive-mocha.vercel.app', siteBaseDomain: 'lojas.autodrive.app' }

describe('resolveSiteHost', () => {
  it('painel: localhost, vercel, app hosts e o próprio domínio base', () => {
    for (const h of ['localhost:3000', '127.0.0.1', 'preview-x.vercel.app', 'APP.autodrive.com.br', 'lojas.autodrive.app', 'www.lojas.autodrive.app']) {
      expect(resolveSiteHost(h, env)).toEqual({ kind: 'app' })
    }
  })
  it('subdomínio da base vira slug (com ou sem www)', () => {
    expect(resolveSiteHost('easycar.lojas.autodrive.app', env)).toEqual({ kind: 'site', key: 'easycar' })
    expect(resolveSiteHost('www.easycar.lojas.autodrive.app:443', env)).toEqual({ kind: 'site', key: 'easycar' })
    expect(resolveSiteHost('a.b.lojas.autodrive.app', env)).toEqual({ kind: 'app' })
  })
  it('qualquer outro host é domínio próprio de loja', () => {
    expect(resolveSiteHost('www.dagobertoeasycar.com.br', env)).toEqual({ kind: 'site', key: 'www.dagobertoeasycar.com.br' })
  })
  it('sem APP_HOSTS, host desconhecido é painel (segurança); com ele, domínio próprio', () => {
    expect(resolveSiteHost('app.novodominio.com.br', {})).toEqual({ kind: 'app' })
    expect(resolveSiteHost('loja.exemplo.com', { appHosts: 'app.x.com' })).toEqual({ kind: 'site', key: 'loja.exemplo.com' })
    expect(resolveSiteHost('', {})).toEqual({ kind: 'app' })
  })
  it('host do NEXTAUTH_URL é sempre painel', () => {
    expect(resolveSiteHost('painel.loja.com', { appHosts: 'x.com', appUrl: 'https://painel.loja.com/' })).toEqual({ kind: 'app' })
  })
  it('normalizeHost', () => {
    expect(normalizeHost(' WWW.Loja.com.br:8080. ')).toBe('www.loja.com.br')
  })
})
