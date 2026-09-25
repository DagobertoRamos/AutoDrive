// =============================================================================
// Site da loja — organização feita pelo lojista (PURO, testado):
//   • Menu do topo: quais páginas aparecem, em que ordem e com que nome, mais
//     links próprios. Todos os itens visíveis ficam no topo (sem "Mais").
//   • Página inicial em blocos: cada bloco pode ser ligado/desligado, mudar de
//     posição e ter seus textos. Padrão = modelo do site da AutoDrive.
// Página cujo serviço está desligado some do menu e o bloco que depende dela
// também não aparece (não dá para linkar para página que não existe).
// =============================================================================

import type { SiteServiceKey } from './config-core'

// ── Menu ─────────────────────────────────────────────────────────────────────

export interface MenuPageDef { key: string; label: string; path: string; service: SiteServiceKey | null; needsBlock?: HomeBlockType }

export const MENU_PAGES: MenuPageDef[] = [
  { key: 'inicio', label: 'Início', path: '/', service: null },
  { key: 'estoque', label: 'Estoque', path: '/veiculos', service: 'estoque' },
  { key: 'sobre', label: 'Sobre nós', path: '/sobre', service: 'sobre' },
  { key: 'financiamento', label: 'Financiamento', path: '/financiamento', service: 'financiamento' },
  { key: 'financiaFacil', label: 'Financia Fácil', path: '/financia-facil', service: 'financiaFacil' },
  { key: 'vendaSeuCarro', label: 'Venda seu carro', path: '/venda-seu-carro', service: 'vendaSeuCarro' },
  { key: 'encontreSeuCarro', label: 'Encontre seu carro', path: '/encontre-seu-carro', service: 'encontreSeuCarro' },
  { key: 'parceiros', label: 'Quero ser parceiro', path: '/#parceiros', service: null, needsBlock: 'partners' },
  { key: 'atacado', label: 'Atacado', path: '/atacado', service: 'atacado' },
  { key: 'contato', label: 'Contato', path: '/contato', service: 'contato' },
]

export interface SiteMenuItem { key: string; label: string; visible: boolean; href?: string }

export const SITE_MAX_MENU = 16

export function defaultMenu(): SiteMenuItem[] {
  // Modelo: Início, Estoque, Sobre nós, Financiamento, Venda seu carro, Quero ser parceiro, Contato.
  const hiddenByDefault = new Set(['financiaFacil', 'encontreSeuCarro', 'atacado'])
  return MENU_PAGES.map((p) => ({ key: p.key, label: p.label, visible: !hiddenByDefault.has(p.key) }))
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const linkOk = (s: string) => /^(https?:\/\/|\/|#)/i.test(s) && !/^\/\//.test(s)

export function sanitizeMenu(input: unknown): SiteMenuItem[] {
  if (!Array.isArray(input)) return defaultMenu()
  const out: SiteMenuItem[] = []
  const seen = new Set<string>()
  for (const raw of input.slice(0, 40)) {
    const b = obj(raw)
    const key = str(b.key, 40)
    const page = MENU_PAGES.find((p) => p.key === key)
    if (page) {
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, label: str(b.label, 40) || page.label, visible: b.visible !== false })
    } else if (key.startsWith('link-')) {
      const href = str(b.href, 300)
      const label = str(b.label, 40)
      if (!label || !linkOk(href) || seen.has(key)) continue
      seen.add(key)
      out.push({ key: key.replace(/[^\w-]/g, '').slice(0, 40), label, visible: b.visible !== false, href })
    }
  }
  // Página nova do produto (ou esquecida) entra no fim, escondida.
  for (const p of MENU_PAGES) if (!seen.has(p.key)) out.push({ key: p.key, label: p.label, visible: false })
  return out.slice(0, SITE_MAX_MENU)
}

/** Itens que de fato aparecem: visíveis e com a página/bloco disponível. */
export function visibleMenu(menu: SiteMenuItem[], on: (s: SiteServiceKey) => boolean, blockOn: (t: HomeBlockType) => boolean): { key: string; label: string; path: string }[] {
  return menu.flatMap((m) => {
    if (!m.visible) return []
    if (m.href) return [{ key: m.key, label: m.label, path: m.href }]
    const page = MENU_PAGES.find((p) => p.key === m.key)
    if (!page) return []
    if (page.service && !on(page.service)) return []
    if (page.needsBlock && !blockOn(page.needsBlock)) return []
    return [{ key: m.key, label: m.label, path: page.path }]
  })
}

// ── Blocos da página inicial ─────────────────────────────────────────────────

export type HomeBlockType =
  | 'hero' | 'banners' | 'actions' | 'showcase' | 'benefits' | 'partners'
  | 'financeSell' | 'services' | 'testimonials' | 'faqLocation' | 'contactBand'

export type ActionKind = 'comprar' | 'vender' | 'buscar' | 'parceiro' | 'financiaFacil' | 'financiamento' | 'sobre'

export interface ActionCard { kind: ActionKind; visible: boolean; title: string; text: string }

export interface HomeBlock {
  type: HomeBlockType
  visible: boolean
  eyebrow: string
  title: string
  text: string
  /** 2ª coluna (Financiamento + Venda). */
  eyebrow2: string
  title2: string
  text2: string
  /** Tópicos (Parceiros). */
  bullets: string[]
  /** Cartões (Como podemos ajudar?). */
  cards: ActionCard[]
}

export interface HomeBlockDef {
  type: HomeBlockType
  label: string
  hint: string
  /** Campos de texto próprios do bloco (os demais vêm de outras seções). */
  fields: ('eyebrow' | 'title' | 'text' | 'eyebrow2' | 'title2' | 'text2' | 'bullets' | 'cards')[]
}

export const HOME_BLOCKS: HomeBlockDef[] = [
  { type: 'hero', label: 'Topo (chamada principal)', hint: 'Título, texto, botões e selos. Os textos ficam em “Página inicial” abaixo.', fields: [] },
  { type: 'banners', label: 'Carrossel de banners', hint: 'As imagens ficam em Site → Banners. Sem banner ativo, o bloco não aparece.', fields: [] },
  { type: 'actions', label: 'Como podemos ajudar? (atalhos)', hint: 'Cartões que levam o cliente para comprar, vender, buscar um carro, financiar ou virar parceiro.', fields: ['eyebrow', 'title', 'text', 'cards'] },
  { type: 'showcase', label: 'Vitrine de destaques', hint: 'Os carros do estoque. Título e texto ficam em “Página inicial”.', fields: [] },
  { type: 'benefits', label: 'Diferenciais', hint: 'Faixa com até 4 diferenciais (edite em “Página inicial”).', fields: [] },
  { type: 'partners', label: 'Parceiros (para lojistas)', hint: 'Convite para lojistas oferecerem estoque ou buscarem carros. O item “Quero ser parceiro” do menu leva para cá.', fields: ['eyebrow', 'title', 'text', 'bullets'] },
  { type: 'financeSell', label: 'Financiamento + Venda seu carro', hint: 'Dois quadros lado a lado com os botões de simular e de enviar o carro.', fields: ['eyebrow', 'title', 'text', 'eyebrow2', 'title2', 'text2'] },
  { type: 'services', label: 'Quadros de serviços', hint: 'Quadros de Financiamento, Financia Fácil, Venda e Encontre seu carro (modelo antigo).', fields: [] },
  { type: 'testimonials', label: 'Depoimentos', hint: 'Os depoimentos ficam em Site → Banners. Sem depoimento, o bloco não aparece.', fields: ['eyebrow', 'title'] },
  { type: 'faqLocation', label: 'Perguntas frequentes + endereço', hint: 'Perguntas em “Página inicial”; endereço em “Contato”.', fields: ['eyebrow', 'title'] },
  { type: 'contactBand', label: 'Faixa final de contato', hint: 'WhatsApp, telefone, e-mail e endereço.', fields: ['eyebrow', 'title'] },
]

export const ACTION_DEFS: { kind: ActionKind; path: string; service: SiteServiceKey | null; needsBlock?: HomeBlockType; title: string; text: string; cta: string }[] = [
  { kind: 'comprar', path: '/veiculos', service: 'estoque', title: 'Quero comprar um carro', text: 'Veja as opções disponíveis no nosso estoque.', cta: 'Ver veículos' },
  { kind: 'vender', path: '/venda-seu-carro', service: 'vendaSeuCarro', title: 'Quero vender ou trocar', text: 'Envie os dados do seu carro e receba uma avaliação inicial, sem compromisso.', cta: 'Avaliar meu carro' },
  { kind: 'buscar', path: '/encontre-seu-carro', service: 'encontreSeuCarro', title: 'Procuro um carro específico', text: 'Conte o modelo, ano e faixa de preço. Procuramos para você.', cta: 'Pedir uma busca' },
  { kind: 'parceiro', path: '/#parceiros', service: null, needsBlock: 'partners', title: 'Quero ser parceiro', text: 'Cadastre sua loja para oferecer veículos ou encontrar oportunidades para o seu estoque.', cta: 'Conhecer a parceria' },
  { kind: 'financiaFacil', path: '/financia-facil', service: 'financiaFacil', title: 'Financia Fácil', text: 'Quer financiar um carro comprado de um amigo ou particular? A gente cuida do caminho.', cta: 'Simular financiamento' },
  { kind: 'financiamento', path: '/financiamento', service: 'financiamento', title: 'Quero financiar', text: 'Faça sua simulação com as financeiras parceiras, com acompanhamento da equipe.', cta: 'Simular' },
  { kind: 'sobre', path: '/sobre', service: 'sobre', title: 'Conheça a loja', text: 'Saiba quem somos e como trabalhamos.', cta: 'Sobre nós' },
]

const BASE: Omit<HomeBlock, 'type' | 'visible'> = { eyebrow: '', title: '', text: '', eyebrow2: '', title2: '', text2: '', bullets: [], cards: [] }

export function defaultHomeBlocks(storeName: string, on: (s: SiteServiceKey) => boolean): HomeBlock[] {
  const cards: ActionCard[] = ACTION_DEFS.map((a) => ({
    kind: a.kind, title: a.title, text: a.text,
    visible: a.kind === 'sobre' || a.kind === 'financiamento' ? false : a.kind === 'parceiro' ? on('atacado') : true,
  }))
  const b = (type: HomeBlockType, visible: boolean, patch: Partial<HomeBlock> = {}): HomeBlock => ({ ...BASE, type, visible, ...patch })
  return [
    b('hero', true),
    b('banners', true),
    b('actions', true, { eyebrow: 'Como podemos ajudar?', title: 'Escolha o que você precisa agora', text: `Você fala com a ${storeName} e nós direcionamos o atendimento para o caminho certo.`, cards }),
    b('showcase', true),
    b('benefits', true),
    b('partners', on('atacado'), {
      eyebrow: 'Para lojistas e profissionais do setor', title: 'Uma rede feita para o estoque girar.',
      text: 'Se você tem veículos para oferecer ou procura carros para completar seu estoque, cadastre-se como parceiro. A equipe acompanha cada negociação.',
      bullets: ['Ofereça veículos do seu estoque', 'Informe os modelos que procura', 'Negociação acompanhada pela equipe'],
    }),
    b('financeSell', true, {
      eyebrow: 'Crédito para comprar', title: 'Financiamento com atendimento de verdade.',
      text: 'Trabalhamos com instituições financeiras parceiras para buscar condições compatíveis com o seu perfil. Toda proposta está sujeita à análise de crédito.',
      eyebrow2: 'Seu carro também é uma oportunidade', title2: 'Venda, troque ou anuncie com a nossa ajuda.',
      text2: 'Envie as informações do veículo. Podemos avaliar a compra, estudar uma troca ou apresentar o carro aos nossos clientes.',
    }),
    b('services', false),
    b('testimonials', true, { eyebrow: 'Quem já negociou', title: 'Atendimento que acompanha cada etapa' }),
    b('faqLocation', true, { eyebrow: 'Dúvidas frequentes', title: 'Informações para negociar com tranquilidade.' }),
    b('contactBand', true, { eyebrow: `Atendimento ${storeName}`, title: 'Vamos conversar?' }),
  ]
}

export function sanitizeHomeBlocks(input: unknown, storeName: string, on: (s: SiteServiceKey) => boolean): HomeBlock[] {
  const defaults = defaultHomeBlocks(storeName, on)
  if (!Array.isArray(input)) return defaults
  const byType = new Map(defaults.map((d) => [d.type, d]))
  const out: HomeBlock[] = []
  for (const raw of input.slice(0, 30)) {
    const b = obj(raw)
    const d = byType.get(str(b.type, 30) as HomeBlockType)
    if (!d || out.some((x) => x.type === d.type)) continue
    const cardsIn = Array.isArray(b.cards) ? b.cards.map(obj) : null
    const cards = d.cards.length
      ? (() => {
          const seen = new Set<string>()
          const list: ActionCard[] = []
          for (const c of cardsIn ?? []) {
            const def = d.cards.find((x) => x.kind === c.kind)
            if (!def || seen.has(def.kind)) continue
            seen.add(def.kind)
            list.push({ kind: def.kind, visible: c.visible !== false, title: str(c.title, 60) || def.title, text: str(c.text, 200) || def.text })
          }
          for (const def of d.cards) if (!seen.has(def.kind)) list.push({ ...def, visible: false })
          return list
        })()
      : []
    out.push({
      type: d.type,
      visible: b.visible !== false,
      eyebrow: str(b.eyebrow, 80) || d.eyebrow,
      title: str(b.title, 120) || d.title,
      text: str(b.text, 500) || d.text,
      eyebrow2: str(b.eyebrow2, 80) || d.eyebrow2,
      title2: str(b.title2, 120) || d.title2,
      text2: str(b.text2, 500) || d.text2,
      bullets: Array.isArray(b.bullets) ? b.bullets.map((x) => str(x, 100)).filter(Boolean).slice(0, 6) : d.bullets,
      cards,
    })
  }
  // Bloco novo do produto entra no fim, desligado.
  for (const d of defaults) if (!out.some((x) => x.type === d.type)) out.push({ ...d, visible: false })
  return out
}
