// =============================================================================
// CRM — Canais de captação (Facebook, Instagram, TikTok, Google, portais...).
// PURO (testado). Modelo dos grandes CRMs (RD Station, Kommo, Followize,
// Cockpit): cada canal da loja ganha uma URL própria de entrada (webhook com
// chave secreta na URL) e configurações de destino (origem, funil, tipo,
// temperatura). Os adaptadores entendem os formatos das plataformas:
//   • Google Ads (formulário de lead): user_column_data + google_key
//   • Meta (Facebook/Instagram Lead Ads): field_data [{ name, values }]
//   • TikTok / LeadsBridge / Zapier / Make / n8n: pares pergunta-resposta ou JSON plano
//   • RD Station: { leads: [...] }
//   • qualquer JSON/form com nomes comuns (nome, telefone, e-mail, mensagem...)
// A integração nativa (OAuth) de cada plataforma entra por cima disto depois.
// =============================================================================

export type ChannelGroup = 'social' | 'ads' | 'portal' | 'tools'

export interface ChannelCatalogItem {
  type: string
  label: string
  group: ChannelGroup
  sourceCode: string // código gravado em MarketingLead.source
  color: string
  /** Como a loja liga hoje (webhook direto na plataforma ou via conector). */
  how: string
  steps: string[]
  /** Pede uma "chave" extra que a plataforma envia no corpo (ex.: google_key). */
  secretLabel?: string
}

export const CHANNEL_GROUP_LABEL: Record<ChannelGroup, string> = {
  social: 'Redes sociais',
  ads: 'Anúncios',
  portal: 'Portais de veículos',
  tools: 'Ferramentas e outros',
}

const VIA_CONNECTOR = 'Enquanto a conexão direta com a plataforma não é liberada, use um conector (Zapier, Make, n8n ou LeadsBridge) que envia cada lead para a URL abaixo.'

export const CHANNEL_CATALOG: ChannelCatalogItem[] = [
  {
    type: 'FACEBOOK', label: 'Facebook (Lead Ads)', group: 'social', sourceCode: 'FACEBOOK', color: '#1877f2',
    how: VIA_CONNECTOR,
    steps: [
      'No conector (Zapier, Make ou LeadsBridge), crie uma automação com o gatilho "Facebook Lead Ads — novo lead" e escolha a Página e o formulário.',
      'Na ação, escolha "Webhook / HTTP — POST" e cole a URL de entrada deste canal.',
      'Envie os campos do formulário (nome, telefone, e-mail, perguntas). Formato JSON; o AutoDrive entende "field_data" do Facebook e campos com nomes comuns.',
      'Clique em "Enviar lead de teste" aqui ou use a Ferramenta de teste de anúncios de cadastro da Meta.',
    ],
  },
  {
    type: 'INSTAGRAM', label: 'Instagram (Lead Ads)', group: 'social', sourceCode: 'INSTAGRAM', color: '#e1306c',
    how: 'Os formulários de cadastro do Instagram são criados no Gerenciador de Anúncios da Meta e chegam pelo mesmo caminho do Facebook. Crie um canal separado se quiser separar a origem nos relatórios.',
    steps: [
      'No conector, use o gatilho "Facebook Lead Ads — novo lead" e escolha o formulário usado nos anúncios do Instagram.',
      'Na ação "Webhook / HTTP — POST", cole a URL de entrada deste canal.',
      'Para o link da bio e o Direct, use o canal "WhatsApp / Link da bio" ou o formulário do site.',
    ],
  },
  {
    type: 'TIKTOK', label: 'TikTok (Lead Generation)', group: 'social', sourceCode: 'TIKTOK', color: '#111111',
    how: 'O TikTok Ads Manager envia os leads do formulário instantâneo direto para um webhook (Leads Center → Conectar CRM) ou via Zapier/LeadsBridge.',
    steps: [
      'No TikTok Ads Manager: Ferramentas → Leads Center → Conectar CRM → "Webhook / API personalizada" (ou Zapier).',
      'Cole a URL de entrada deste canal e escolha o formulário instantâneo.',
      'Mapeie nome, telefone e e-mail e envie o teste do próprio TikTok.',
    ],
  },
  {
    type: 'KWAI', label: 'Kwai', group: 'social', sourceCode: 'KWAI', color: '#ff7a00',
    how: VIA_CONNECTOR,
    steps: ['No Kwai for Business, exporte os leads do formulário para o conector (ou webhook) e aponte para a URL de entrada deste canal.'],
  },
  {
    type: 'LINKEDIN', label: 'LinkedIn (Lead Gen Forms)', group: 'social', sourceCode: 'LINKEDIN', color: '#0a66c2',
    how: VIA_CONNECTOR,
    steps: ['No conector, gatilho "LinkedIn Lead Gen Forms — novo lead" e ação "Webhook POST" para a URL de entrada deste canal.'],
  },
  {
    type: 'WHATSAPP_LINK', label: 'WhatsApp / Link da bio', group: 'social', sourceCode: 'WHATSAPP', color: '#25d366',
    how: 'Para formulários próprios (link da bio, página de captura, chatbot) que conseguem fazer um POST com os dados do cliente.',
    steps: ['Configure a ferramenta (chatbot, página de captura, Linktree com formulário) para enviar um POST com nome, telefone e mensagem para a URL de entrada deste canal.'],
  },
  {
    type: 'GOOGLE_ADS', label: 'Google Ads / YouTube (formulário de lead)', group: 'ads', sourceCode: 'GOOGLE_ADS', color: '#4285f4',
    how: 'O Google Ads envia os leads do "recurso de formulário de lead" (Pesquisa, YouTube, Discovery, Performance Max) direto para um webhook.',
    steps: [
      'No Google Ads: Recursos → Formulários de lead → edite o formulário → "Integração de webhook".',
      'Em "URL do webhook", cole a URL de entrada deste canal.',
      'Em "Chave", cole a chave secreta deste canal (o AutoDrive confere se o lead veio mesmo do Google).',
      'Clique em "Enviar dados de teste" no Google Ads e confira aqui no registro.',
    ],
    secretLabel: 'Chave do webhook (google_key)',
  },
  {
    type: 'OLX', label: 'OLX', group: 'portal', sourceCode: 'OLX', color: '#6e0ad6',
    how: 'A OLX envia cada lead por POST para uma URL do integrador (API de leads OLX Autos). A ativação é feita junto à OLX.',
    steps: [
      'Informe à OLX (Central do Anunciante Profissional / integradores) a URL de entrada deste canal como endpoint de leads.',
      'Se a OLX pedir token, use a chave secreta deste canal (enviada no cabeçalho Authorization).',
      'Enquanto não ativa, os leads da OLX podem vir pelo e-mail de aviso via conector.',
    ],
    secretLabel: 'Token (cabeçalho Authorization)',
  },
  {
    type: 'WEBMOTORS', label: 'Webmotors', group: 'portal', sourceCode: 'WEBMOTORS', color: '#e4002b',
    how: 'A Webmotors entrega os leads no Cockpit e por e-mail. Use um conector que lê o e-mail de lead e envia para a URL de entrada.',
    steps: ['No conector (Zapier Email Parser, Make ou n8n), leia os e-mails de lead da Webmotors e envie nome, telefone, e-mail, veículo e mensagem para a URL de entrada deste canal.'],
  },
  {
    type: 'ICARROS', label: 'iCarros', group: 'portal', sourceCode: 'ICARROS', color: '#ff5a00',
    how: 'O iCarros entrega leads por e-mail/painel. Use um conector que lê o e-mail de lead e envia para a URL de entrada.',
    steps: ['No conector, leia os e-mails de lead do iCarros e envie os dados para a URL de entrada deste canal.'],
  },
  {
    type: 'MERCADO_LIVRE', label: 'Mercado Livre', group: 'portal', sourceCode: 'MERCADO_LIVRE', color: '#ffe600',
    how: 'Perguntas e contatos dos anúncios de veículos. Via conector (Zapier/Make têm Mercado Livre) até a conexão direta.',
    steps: ['No conector, gatilho "Mercado Livre — nova pergunta/contato" e ação "Webhook POST" para a URL de entrada deste canal.'],
  },
  {
    type: 'MOBIAUTO', label: 'Mobiauto', group: 'portal', sourceCode: 'MOBIAUTO', color: '#00b2a9',
    how: 'Leads por e-mail/painel. Use um conector que envia para a URL de entrada.',
    steps: ['No conector, leia os e-mails de lead da Mobiauto e envie para a URL de entrada deste canal.'],
  },
  {
    type: 'USADOSBR', label: 'UsadosBR / Autoline / outros portais', group: 'portal', sourceCode: 'PORTAL', color: '#64748b',
    how: 'Qualquer portal que envie lead por webhook ou e-mail (via conector).',
    steps: ['Aponte o webhook do portal (ou o conector que lê o e-mail de lead) para a URL de entrada deste canal.'],
  },
  {
    type: 'RD_STATION', label: 'RD Station Marketing', group: 'tools', sourceCode: 'RD_STATION', color: '#19c1ce',
    how: 'O RD Station envia conversões por webhook (Integrações → Webhooks).',
    steps: ['No RD Station: Integrações → Webhooks → criar, gatilho "Conversão", cole a URL de entrada deste canal.'],
  },
  {
    type: 'GENERIC', label: 'Webhook genérico (Zapier, Make, n8n, landing page)', group: 'tools', sourceCode: 'OUTROS', color: '#0f766e',
    how: 'Para qualquer sistema que faça um POST com JSON ou formulário.',
    steps: [
      'Faça um POST para a URL de entrada com JSON, por exemplo: {"nome":"João","telefone":"11999998888","email":"joao@x.com","mensagem":"Quero o Onix","veiculo":"Onix 2022","campanha":"Feirão"}',
      'Campos aceitos (qualquer um dos nomes): nome/name, telefone/phone/whatsapp/celular, email, mensagem/message, veiculo/vehicle, campanha/campaign, anuncio/ad_name, formulario/form_name, lead_id/id.',
    ],
  },
]

export const catalogItem = (type: string) => CHANNEL_CATALOG.find((c) => c.type === type) ?? null

/** Origens que os canais gravam (somam-se às origens do sistema no CRM). */
export const CHANNEL_SOURCES: { code: string; label: string }[] = [
  { code: 'FACEBOOK', label: 'Facebook' },
  { code: 'INSTAGRAM', label: 'Instagram' },
  { code: 'TIKTOK', label: 'TikTok' },
  { code: 'KWAI', label: 'Kwai' },
  { code: 'LINKEDIN', label: 'LinkedIn' },
  { code: 'WHATSAPP', label: 'WhatsApp' },
  { code: 'GOOGLE_ADS', label: 'Google Ads / YouTube' },
  { code: 'OLX', label: 'OLX' },
  { code: 'WEBMOTORS', label: 'Webmotors' },
  { code: 'ICARROS', label: 'iCarros' },
  { code: 'MERCADO_LIVRE', label: 'Mercado Livre' },
  { code: 'MOBIAUTO', label: 'Mobiauto' },
  { code: 'PORTAL', label: 'Outros portais' },
  { code: 'RD_STATION', label: 'RD Station' },
  { code: 'OUTROS', label: 'Outras integrações' },
]

// ── Configuração dos canais da loja ──────────────────────────────────────────

export interface LeadChannel {
  id: string
  type: string
  name: string
  active: boolean
  /** Parte secreta da URL de entrada (identifica loja + canal). Nunca muda. */
  key: string
  /** Chave extra conferida no corpo/cabeçalho (google_key, token da OLX). */
  secret: string
  sourceCode: string
  pipelineId: string | null
  leadType: string | null
  temperature: string | null
  createdAt: string
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/**
 * Valida a lista enviada pela tela. Chave e data de criação vêm SEMPRE do que
 * já existe (o cliente não escolhe a chave); canal novo recebe chave de `newKey`.
 */
export function sanitizeChannels(input: unknown, existing: LeadChannel[], newKey: () => string, now = new Date()): LeadChannel[] {
  const byId = new Map(existing.map((c) => [c.id, c]))
  const out: LeadChannel[] = []
  for (const raw of Array.isArray(input) ? input.slice(0, 60) : []) {
    const b = obj(raw)
    const item = catalogItem(str(b.type, 40))
    if (!item) continue
    const prev = byId.get(str(b.id, 60))
    const id = prev?.id ?? `ch_${newKey().slice(0, 12)}`
    if (out.some((c) => c.id === id)) continue
    out.push({
      id,
      type: prev?.type ?? item.type,
      name: str(b.name, 80) || item.label,
      active: b.active !== false,
      key: prev?.key ?? newKey(),
      secret: str(b.secret, 200),
      sourceCode: str(b.sourceCode, 40).toUpperCase().replace(/[^A-Z0-9_]/g, '') || item.sourceCode,
      pipelineId: str(b.pipelineId, 60) || null,
      leadType: str(b.leadType, 60) || null,
      temperature: str(b.temperature, 20) || null,
      createdAt: prev?.createdAt ?? now.toISOString(),
    })
  }
  return out
}

// ── Leitura do lead recebido ─────────────────────────────────────────────────

export interface InboundLead {
  name: string
  phone: string
  email: string
  message: string
  vehicle: string
  city: string
  externalId: string
  campaign: string
  adName: string
  formName: string
  /** Perguntas extras do formulário (pergunta → resposta). */
  answers: [string, string][]
  isTest: boolean
}

export type ParseResult =
  | { ok: true; lead: InboundLead; secret: string }
  | { ok: false; error: string }

const fold = (k: string) => k.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const KEYS = {
  name: ['name', 'nome', 'full_name', 'fullname', 'nome_completo', 'customer_name', 'cliente', 'contact_name'],
  firstName: ['first_name', 'primeiro_nome', 'firstname'],
  lastName: ['last_name', 'sobrenome', 'lastname'],
  phone: ['phone', 'phone_number', 'telefone', 'celular', 'whatsapp', 'fone', 'tel', 'mobile', 'mobile_phone', 'personal_phone', 'telefone_celular', 'numero'],
  email: ['email', 'e_mail', 'mail', 'email_address', 'work_email'],
  message: ['message', 'mensagem', 'msg', 'comments', 'comentario', 'comentarios', 'observacao', 'observacoes', 'obs', 'texto', 'question', 'pergunta'],
  vehicle: ['vehicle', 'veiculo', 'carro', 'modelo', 'vehicle_model', 'interesse', 'car', 'anuncio_titulo', 'ad_title', 'produto'],
  city: ['city', 'cidade'],
  externalId: ['lead_id', 'leadgen_id', 'leadid', 'id_lead', 'id'],
  campaign: ['campaign', 'campaign_name', 'campanha', 'utm_campaign', 'campaign_id'],
  adName: ['ad_name', 'anuncio', 'ad', 'ad_id', 'creative_id', 'adgroup_name', 'adset_name'],
  formName: ['form_name', 'formulario', 'form', 'form_id'],
} as const

const ANSWER_NAME = ['name', 'question', 'field', 'key', 'label', 'column_name', 'column_id', 'field_name', 'pergunta']
const ANSWER_VALUE = ['values', 'value', 'answer', 'string_value', 'resposta', 'field_value']

/** Converte um par pergunta-resposta ({name, values:[...]} etc.) em [chave, texto]. */
function answerPair(o: Record<string, unknown>): [string, string] | null {
  const nk = ANSWER_NAME.find((k) => typeof o[k] === 'string' && (o[k] as string).trim())
  const vk = ANSWER_VALUE.find((k) => o[k] != null)
  if (!nk || !vk) return null
  const raw = o[vk]
  const value = Array.isArray(raw) ? raw.map((x) => String(x ?? '')).join(', ') : typeof raw === 'object' ? '' : String(raw)
  // Google manda column_id (FULL_NAME) e column_name (rótulo): prefere o id para casar.
  const name = typeof o.column_id === 'string' ? o.column_id : String(o[nk])
  return [name, value.trim()]
}

/** Achata o corpo em pares chave→valor (1 nível de objetos aninhados + listas de respostas). */
function flatten(body: Record<string, unknown>): { flat: Map<string, string>; answers: [string, string][] } {
  const flat = new Map<string, string>()
  const answers: [string, string][] = []
  const put = (k: string, v: unknown) => {
    const key = fold(k)
    if (!key || flat.has(key)) return
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') flat.set(key, String(v).trim())
  }
  const walk = (o: Record<string, unknown>, depth: number) => {
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) {
        for (const it of v) {
          if (it && typeof it === 'object') {
            const pair = answerPair(it as Record<string, unknown>)
            if (pair) { answers.push(pair); put(pair[0], pair[1]) } else if (depth < 2) walk(it as Record<string, unknown>, depth + 1)
          }
        }
      } else if (v && typeof v === 'object') {
        if (depth < 2) walk(v as Record<string, unknown>, depth + 1)
      } else put(k, v)
    }
  }
  walk(body, 0)
  return { flat, answers }
}

const pick = (flat: Map<string, string>, keys: readonly string[]) => {
  for (const k of keys) { const v = flat.get(k); if (v) return v }
  return ''
}

const digits = (s: string) => s.replace(/\D/g, '')

/** Telefone BR legível: tira DDI 55 e formata (11) 99999-8888 quando dá. */
export function normalizePhone(raw: string): string {
  let d = digits(raw)
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw.trim().slice(0, 30)
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/** Campos que já viraram dado do lead não se repetem nas "respostas". */
const CONSUMED = new Set<string>([...Object.values(KEYS).flat(), 'full_name', 'phone_number', 'email', 'first_name', 'last_name'].map(fold))

export function parseInboundLead(body: unknown, headers: { authorization?: string | null } = {}): ParseResult {
  let b = obj(body)
  // RD Station: { leads: [ {...} ] }
  if (Array.isArray(b.leads) && b.leads.length) b = { ...obj(b.leads[0]), ...Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'leads')) }
  if (!Object.keys(b).length) return { ok: false, error: 'Corpo vazio ou não é JSON/formulário.' }

  const { flat, answers } = flatten(b)
  let name = pick(flat, KEYS.name)
  if (!name) name = [pick(flat, KEYS.firstName), pick(flat, KEYS.lastName)].filter(Boolean).join(' ')
  const phoneRaw = pick(flat, KEYS.phone)
  const emailRaw = pick(flat, KEYS.email)
  const email = isEmail(emailRaw) ? emailRaw.toLowerCase().slice(0, 160) : ''
  const phone = digits(phoneRaw).length >= 8 ? normalizePhone(phoneRaw) : ''
  if (!phone && !email) return { ok: false, error: 'O lead precisa ter telefone ou e-mail.' }

  const extra = answers.filter(([k, v]) => v && !CONSUMED.has(fold(k)))
  const isTest = ['is_test', 'test', 'teste'].some((k) => ['true', '1', 'sim', 'yes'].includes((flat.get(k) ?? '').toLowerCase()))
  const secret = str(b.google_key, 200) || str(b.secret, 200) || str(b.token, 200) || String(headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()

  return {
    ok: true,
    secret,
    lead: {
      name: (name || 'Lead sem nome').slice(0, 120),
      phone, email,
      message: pick(flat, KEYS.message).slice(0, 2000),
      vehicle: pick(flat, KEYS.vehicle).slice(0, 160),
      city: pick(flat, KEYS.city).slice(0, 80),
      externalId: pick(flat, KEYS.externalId).slice(0, 120),
      campaign: pick(flat, KEYS.campaign).slice(0, 160),
      adName: pick(flat, KEYS.adName).slice(0, 160),
      formName: pick(flat, KEYS.formName).slice(0, 160),
      answers: extra.slice(0, 30).map(([k, v]) => [k.slice(0, 80), v.slice(0, 500)]),
      isTest,
    },
  }
}

/** Texto que vai para a observação do lead no CRM. */
export function inboundLeadNotes(lead: InboundLead, channelName: string): string {
  const lines = [`Lead recebido pelo canal "${channelName}"${lead.isTest ? ' (TESTE)' : ''}.`]
  if (lead.vehicle) lines.push(`Veículo de interesse: ${lead.vehicle}`)
  if (lead.message) lines.push(`Mensagem: ${lead.message}`)
  if (lead.city) lines.push(`Cidade: ${lead.city}`)
  for (const [q, a] of lead.answers) lines.push(`${q}: ${a}`)
  const origin = [lead.campaign && `campanha ${lead.campaign}`, lead.adName && `anúncio ${lead.adName}`, lead.formName && `formulário ${lead.formName}`].filter(Boolean)
  if (origin.length) lines.push(`Origem: ${origin.join(' · ')}`)
  return lines.join('\n').slice(0, 4000)
}

/** Confere a chave extra quando o canal tem uma configurada. */
export function secretMatches(channel: Pick<LeadChannel, 'secret'>, received: string): boolean {
  if (!channel.secret) return true
  return received === channel.secret
}
