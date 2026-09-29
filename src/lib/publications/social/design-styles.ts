// =============================================================================
// Modelos visuais (PURO): os 12 estilos usados nos vídeos (Reels) e nas artes
// (Post, Carrossel, Story). Cada estilo define fontes, cores, fundo, elementos
// gráficos e o ritmo do vídeo. O carro aparece SEMPRE inteiro.
// Fontes: Google Fonts embutidas (OFL/Apache) — ver fonts/FONTES.txt.
// =============================================================================

export const FONTS = {
  sans: { family: 'Liberation Sans', file: 'LiberationSans-Regular.ttf' },
  sansBold: { family: 'Liberation Sans Bold', file: 'LiberationSans-Bold.ttf' },
  anton: { family: 'Anton', file: 'Anton-Regular.ttf' },
  bebas: { family: 'Bebas Neue', file: 'BebasNeue-Regular.ttf' },
  abril: { family: 'Abril Fatface', file: 'AbrilFatface-Regular.ttf' },
  arcade: { family: 'Press Start 2P', file: 'PressStart2P-Regular.ttf' },
  neon: { family: 'Monoton', file: 'Monoton-Regular.ttf' },
  marker: { family: 'Permanent Marker', file: 'PermanentMarker-Regular.ttf' },
  comic: { family: 'Bangers', file: 'Bangers-Regular.ttf' },
  sport: { family: 'Russo One', file: 'RussoOne-Regular.ttf' },
  retro: { family: 'Righteous', file: 'Righteous-Regular.ttf' },
  elegant: { family: 'Marcellus', file: 'Marcellus-Regular.ttf' },
  vhs: { family: 'VT323', file: 'VT323-Regular.ttf' },
  script: { family: 'Pacifico', file: 'Pacifico-Regular.ttf' },
} as const
export type FontKey = keyof typeof FONTS

export const DESIGN_STYLES = ['CLASSICO', 'TELEJORNAL', 'TIKTOK', 'AMADOR', 'ANOS80', 'ANOS90', 'ANOS2000', 'LUXO', 'ESPORTIVO', 'FEIRAO', 'FAMILIA', 'REVISTA'] as const
export type DesignStyle = (typeof DESIGN_STYLES)[number]
export const isDesignStyle = (x: unknown): x is DesignStyle => typeof x === 'string' && (DESIGN_STYLES as readonly string[]).includes(x)

export type Background = 'blur' | 'studio' | 'synthwave' | 'vhs' | 'gloss' | 'black' | 'speed' | 'sunburst' | 'warm' | 'paper' | 'news' | 'phone'
export type Motion = 'suave' | 'dinamico' | 'tremido'

export interface DesignSpec {
  id: DesignStyle
  label: string
  description: string
  title: FontKey
  /** Fonte da chamada de abertura (padrão: a do título). */
  hookFont?: FontKey
  body: FontKey
  price: FontKey
  /** Cores fixas do estilo; `brand` = usa as cores da loja como destaque. */
  accent: string | 'brand'
  accent2: string
  text: string
  panel: string
  uppercase: boolean
  /** Contorno escuro no texto (estilo TikTok/legendas). */
  outline: boolean
  background: Background
  motion: Motion
  /** Transições do ffmpeg usadas entre as cenas. */
  transitions: string[]
  /** Frases do estilo (gancho e chamadas). */
  hook: string
  cta: string
}

export const DESIGNS: Record<DesignStyle, DesignSpec> = {
  CLASSICO: { id: 'CLASSICO', label: 'Clássico premium', description: 'Limpo e elegante, nas cores da loja. Funciona para qualquer carro.', title: 'anton', body: 'sansBold', price: 'anton', accent: 'brand', accent2: '#ffffff', text: '#ffffff', panel: '#0b1220', uppercase: true, outline: false, background: 'blur', motion: 'suave', transitions: ['fade', 'smoothleft', 'fade', 'circleopen'], hook: 'CONFIRA', cta: 'CHAME NO WHATSAPP' },
  TELEJORNAL: { id: 'TELEJORNAL', label: 'Telejornal (notícia)', description: '“Plantão”, faixa de notícia e letreiro correndo — parece reportagem.', title: 'bebas', body: 'sansBold', price: 'bebas', accent: '#d31b1b', accent2: '#0b3d91', text: '#ffffff', panel: '#0b1f4a', uppercase: true, outline: false, background: 'news', motion: 'suave', transitions: ['wipeleft', 'fade', 'slideleft', 'fade'], hook: 'URGENTE: CHEGOU AO ESTOQUE', cta: 'LIGUE AGORA' },
  TIKTOK: { id: 'TIKTOK', label: 'TikTok viral', description: 'Legendas grandes com contorno, ritmo rápido e zoom — formato que viraliza.', title: 'anton', body: 'anton', price: 'anton', accent: '#fe2c55', accent2: '#25f4ee', text: '#ffffff', panel: '#000000', uppercase: true, outline: true, background: 'blur', motion: 'dinamico', transitions: ['zoomin', 'slideup', 'circlecrop', 'smoothup'], hook: 'OLHA ESSA MÁQUINA', cta: 'CORRE NO WHATS' },
  AMADOR: { id: 'AMADOR', label: 'Amador (celular)', description: 'Jeito de vídeo gravado no celular, com escrita à mão — passa naturalidade.', title: 'marker', body: 'marker', price: 'marker', accent: '#ffe14d', accent2: '#ffffff', text: '#ffffff', panel: '#000000', uppercase: false, outline: true, background: 'phone', motion: 'tremido', transitions: ['fade', 'fade', 'slideleft'], hook: 'Gente, olha o que chegou aqui na loja', cta: 'Chama no zap!' },
  ANOS80: { id: 'ANOS80', label: 'Anos 80 (neon)', description: 'Neon, grade no horizonte e pôr do sol retrô — clima de synthwave.', title: 'retro', hookFont: 'neon', body: 'retro', price: 'retro', accent: '#ff2bd6', accent2: '#1ff4ff', text: '#ffffff', panel: '#1a0033', uppercase: true, outline: false, background: 'synthwave', motion: 'suave', transitions: ['fade', 'circleopen', 'fade', 'dissolve'], hook: 'DIRETO DO FUTURO', cta: 'LIGUE JÁ' },
  ANOS90: { id: 'ANOS90', label: 'Anos 90 (VHS)', description: 'Fita VHS: “PLAY”, data na tela, linhas de TV e cores fortes.', title: 'comic', body: 'vhs', price: 'comic', accent: '#ffd400', accent2: '#00a8ff', text: '#ffffff', panel: '#111111', uppercase: true, outline: true, background: 'vhs', motion: 'suave', transitions: ['fade', 'pixelize', 'fade', 'hblur'], hook: 'IMPERDÍVEL!', cta: 'LIGUE JÁ' },
  ANOS2000: { id: 'ANOS2000', label: 'Anos 2000 (brilho)', description: 'Selos estourados, brilho e degradê — propaganda de TV dos anos 2000.', title: 'retro', body: 'retro', price: 'retro', accent: '#ff7a00', accent2: '#1e6bff', text: '#ffffff', panel: '#0a2a6b', uppercase: true, outline: false, background: 'gloss', motion: 'dinamico', transitions: ['radial', 'fade', 'circleopen', 'slideright'], hook: 'SUPER OFERTA', cta: 'LIGUE AGORA MESMO' },
  LUXO: { id: 'LUXO', label: 'Luxo (minimalista)', description: 'Preto e dourado, letras finas e ritmo lento — para carros de alto padrão.', title: 'elegant', body: 'elegant', price: 'elegant', accent: '#c9a54c', accent2: '#f3e5b5', text: '#f5f1e6', panel: '#000000', uppercase: true, outline: false, background: 'black', motion: 'suave', transitions: ['fade', 'fadeblack', 'fade'], hook: 'EXCLUSIVIDADE', cta: 'AGENDE UMA VISITA' },
  ESPORTIVO: { id: 'ESPORTIVO', label: 'Esportivo (corrida)', description: 'Faixas diagonais, linhas de velocidade e letras de corrida.', title: 'sport', body: 'sport', price: 'sport', accent: '#ff3b00', accent2: '#ffffff', text: '#ffffff', panel: '#111111', uppercase: true, outline: false, background: 'speed', motion: 'dinamico', transitions: ['slideleft', 'wiperight', 'slideleft', 'smoothleft'], hook: 'PRONTO PARA ACELERAR', cta: 'TEST DRIVE JÁ' },
  FEIRAO: { id: 'FEIRAO', label: 'Feirão (varejo)', description: 'Amarelo e vermelho, etiqueta de preço e selos — cara de feirão.', title: 'comic', body: 'sansBold', price: 'comic', accent: '#e50914', accent2: '#ffd400', text: '#ffffff', panel: '#e50914', uppercase: true, outline: true, background: 'sunburst', motion: 'dinamico', transitions: ['circleopen', 'slideup', 'zoomin', 'fade'], hook: 'FEIRÃO DE OFERTAS', cta: 'SÓ HOJE! CHAME JÁ' },
  FAMILIA: { id: 'FAMILIA', label: 'Família (acolhedor)', description: 'Tons quentes, cantos arredondados e letra cursiva — conforto e confiança.', title: 'script', body: 'sansBold', price: 'sansBold', accent: '#f08a24', accent2: '#ffffff', text: '#3b2410', panel: '#fff6ea', uppercase: false, outline: false, background: 'warm', motion: 'suave', transitions: ['fade', 'smoothleft', 'fade'], hook: 'Para toda a família', cta: 'Venha conhecer' },
  REVISTA: { id: 'REVISTA', label: 'Revista (capa)', description: 'Capa de revista automotiva: título grande, manchetes e moldura.', title: 'abril', body: 'sansBold', price: 'abril', accent: '#c1121f', accent2: '#111111', text: '#111111', panel: '#ffffff', uppercase: false, outline: false, background: 'paper', motion: 'suave', transitions: ['fade', 'slideleft', 'fade', 'wipeleft'], hook: 'Destaque da edição', cta: 'Reserve o seu' },
}

export const VIDEO_SECONDS = [30, 40, 50, 60] as const
export type VideoSeconds = (typeof VIDEO_SECONDS)[number]
export const isVideoSeconds = (x: unknown): x is VideoSeconds => (VIDEO_SECONDS as readonly number[]).includes(Number(x))
