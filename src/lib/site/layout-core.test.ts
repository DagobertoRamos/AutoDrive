import { describe, expect, it } from 'vitest'
import { defaultHomeBlocks, defaultMenu, HOME_BLOCKS, MENU_PAGES, sanitizeHomeBlocks, sanitizeMenu, visibleMenu } from './layout-core'
import { defaultSiteConfig, sanitizeSiteConfig } from './config-core'

const allOn = () => true

describe('menu do topo', () => {
  it('padrão segue o modelo e tem todas as páginas', () => {
    const m = defaultMenu()
    expect(m.map((x) => x.key)).toEqual(MENU_PAGES.map((p) => p.key))
    expect(m.filter((x) => x.visible).map((x) => x.label)).toEqual(['Início', 'Estoque', 'Sobre nós', 'Financiamento', 'Venda seu carro', 'Quero ser parceiro', 'Contato'])
  })

  it('ordem e nomes do lojista; página esquecida entra no fim oculta; link próprio validado', () => {
    const m = sanitizeMenu([
      { key: 'contato', label: 'Fale conosco' },
      { key: 'estoque', visible: false },
      { key: 'link-1', label: 'Blog', href: 'https://blog.loja.com' },
      { key: 'link-2', label: 'Ruim', href: 'javascript:alert(1)' },
      { key: 'contato', label: 'dup' },
    ])
    expect(m[0]).toEqual({ key: 'contato', label: 'Fale conosco', visible: true })
    expect(m[1]).toMatchObject({ key: 'estoque', label: 'Estoque', visible: false })
    expect(m[2]).toMatchObject({ key: 'link-1', href: 'https://blog.loja.com' })
    expect(m.some((x) => x.key === 'link-2')).toBe(false)
    expect(m.find((x) => x.key === 'sobre')).toMatchObject({ visible: false })
  })

  it('visibleMenu: some página de serviço desligado e "parceiros" sem o bloco', () => {
    const menu = defaultMenu().map((x) => ({ ...x, visible: true }))
    const on = (s: string) => s !== 'atacado'
    const noPartners = visibleMenu(menu, on as never, () => false).map((x) => x.key)
    expect(noPartners).not.toContain('atacado')
    expect(noPartners).not.toContain('parceiros')
    expect(visibleMenu(menu, on as never, (t) => t === 'partners').map((x) => x.key)).toContain('parceiros')
  })
})

describe('blocos da página inicial', () => {
  it('padrão: todos os tipos, na ordem do modelo; parceiros depende do atacado', () => {
    const b = defaultHomeBlocks('Loja X', (s) => s !== 'atacado')
    expect(b.map((x) => x.type)).toEqual(HOME_BLOCKS.map((x) => x.type))
    expect(b.find((x) => x.type === 'partners')?.visible).toBe(false)
    expect(defaultHomeBlocks('Loja X', allOn).find((x) => x.type === 'partners')?.visible).toBe(true)
    expect(b.find((x) => x.type === 'contactBand')?.eyebrow).toBe('Atendimento Loja X')
  })

  it('ordem e textos do lojista; tipo inválido ignorado; bloco faltante entra desligado', () => {
    const b = sanitizeHomeBlocks([
      { type: 'showcase' },
      { type: 'actions', title: 'Como ajudar', cards: [{ kind: 'buscar', visible: true, title: 'Busca' }, { kind: 'xx' }] },
      { type: 'hacker' },
      { type: 'hero', visible: false },
    ], 'Loja', allOn)
    expect(b.slice(0, 3).map((x) => x.type)).toEqual(['showcase', 'actions', 'hero'])
    expect(b[2].visible).toBe(false)
    expect(b[1].title).toBe('Como ajudar')
    expect(b[1].cards[0]).toMatchObject({ kind: 'buscar', title: 'Busca', visible: true })
    expect(b[1].cards.length).toBeGreaterThan(1)
    expect(b.find((x) => x.type === 'contactBand')?.visible).toBe(false)
    expect(b.length).toBe(HOME_BLOCKS.length)
  })

  it('config antiga (sem menu/blocos) ganha os padrões; config nova passa pelo sanitize', () => {
    const c = sanitizeSiteConfig({ services: { atacado: true } }, 'Loja')
    expect(c.menu.length).toBe(MENU_PAGES.length)
    expect(c.homeBlocks.find((x) => x.type === 'partners')?.visible).toBe(true)
    expect(defaultSiteConfig('Loja').homeBlocks.length).toBe(HOME_BLOCKS.length)
  })
})
