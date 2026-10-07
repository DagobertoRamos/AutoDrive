// =============================================================================
// Hub de Canais e Integrações — catálogo por CAPACIDADES. PURO (testado).
// Cada canal declara o que realmente faz HOJE no AutoDrive, por capacidade:
//   publicar anúncios · receber leads · receber mensagens · responder mensagens ·
//   sincronizar estoque · devolver conversões (marketing de ciclo fechado).
// Nunca assume que todos os canais fazem tudo e nunca finge integração: o que
// depende de contrato/homologação do portal aparece assim. A disponibilidade da
// PUBLICAÇÃO vem do catálogo da Central de Publicações (fonte única).
// Canal novo = um item aqui + o processador/conector dele; o CRM não muda.
// =============================================================================

export type HubCategory = 'PORTAIS' | 'REDES' | 'MENSAGENS' | 'PUBLICIDADE' | 'SITES' | 'OUTROS'

export const HUB_CATEGORY_LABEL: Record<HubCategory, string> = {
  PORTAIS: 'Portais de veículos',
  REDES: 'Redes sociais',
  MENSAGENS: 'Mensagens',
  PUBLICIDADE: 'Publicidade',
  SITES: 'Sites',
  OUTROS: 'Outros',
}

export type Capability = 'publication' | 'receiveLeads' | 'receiveMessages' | 'sendMessages' | 'inventorySync' | 'conversionPostback'

export const CAPABILITY_LABEL: Record<Capability, string> = {
  publication: 'Publicar anúncios',
  receiveLeads: 'Receber leads',
  receiveMessages: 'Receber mensagens',
  sendMessages: 'Responder pelo CRM',
  inventorySync: 'Sincronizar estoque',
  conversionPostback: 'Enviar vendas para o canal',
}

/**
 * SIM = funciona hoje · HOMOLOGACAO = pronto, aguardando homologação do portal ·
 * CONTRATO = depende de contrato/integração homologada com o portal ·
 * EM_BREVE = planejado · NAO = o canal não oferece.
 */
export type CapState = 'SIM' | 'HOMOLOGACAO' | 'CONTRATO' | 'EM_BREVE' | 'NAO'

/** Como a loja conecta cada parte. Cada um abre o assistente/tela já existente. */
export type SetupKind =
  | 'PUBLICACAO' // conta no canal (Central de Publicações)
  | 'CAPTACAO' // canal de captação do CRM (URL de entrada / e-mail exclusivo)
  | 'WHATSAPP' // WhatsApp oficial da loja
  | 'SITE' // site da loja no AutoDrive
  | 'TELEFONIA' // conexões de telefonia
  | 'EMAIL_PARSER' // e-mail exclusivo do canal

export interface HubItem {
  id: string
  name: string
  category: HubCategory
  color: string
  /** Palavras extras para a busca. */
  aliases?: string[]
  caps: Partial<Record<Capability, CapState>>
  /** Canal da Central de Publicações (a disponibilidade de publicar vem de lá). */
  publicationChannel?: string
  /** Tipo de canal de captação do CRM que recebe os leads deste canal. */
  leadChannelType?: string
  /** Partes que a loja configura, na ordem do assistente. */
  setup: SetupKind[]
  /** Pré-requisitos curtos (assistente, etapa 1). */
  prerequisites: string[]
  /** Explicação do (?) do card. */
  hint: string
}

const EMAIL_LEADS = 'Os avisos de lead do portal são lidos automaticamente pelo e-mail exclusivo do canal.'

/** Portais que entregam lead por e-mail e só publicam via integrador homologado. */
const regional = (id: string, name: string, color: string, publicationChannel?: string): HubItem => ({
  id, name, category: 'PORTAIS', color,
  caps: { publication: 'CONTRATO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO' },
  ...(publicationChannel ? { publicationChannel } : {}),
  leadChannelType: 'USADOSBR', setup: ['CAPTACAO', 'EMAIL_PARSER'],
  prerequisites: ['Acesso ao painel do portal para trocar o e-mail que recebe os leads.'],
  hint: `${EMAIL_LEADS} Publicação automática depende de integração homologada com o portal.`,
})

export const HUB_CATALOG: HubItem[] = [
  // ── Portais ────────────────────────────────────────────────────────────────
  {
    id: 'webmotors', name: 'Webmotors', category: 'PORTAIS', color: '#e4002b', aliases: ['cockpit'],
    caps: { publication: 'HOMOLOGACAO', inventorySync: 'HOMOLOGACAO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO' },
    publicationChannel: 'WEBMOTORS', leadChannelType: 'WEBMOTORS', setup: ['PUBLICACAO', 'CAPTACAO', 'EMAIL_PARSER'],
    prerequisites: ['Plano de revenda no Cockpit Webmotors.', 'Usuário Integrador de API, criado pelo consultor Webmotors.'],
    hint: 'Publicação pelo serviço oficial de integração da Webmotors, com o Usuário Integrador da sua loja. Leads chegam pelo e-mail exclusivo do canal.',
  },
  {
    id: 'olx', name: 'OLX', category: 'PORTAIS', color: '#6e0ad6',
    caps: { publication: 'HOMOLOGACAO', inventorySync: 'HOMOLOGACAO', receiveLeads: 'SIM', receiveMessages: 'EM_BREVE', sendMessages: 'EM_BREVE' },
    publicationChannel: 'OLX', leadChannelType: 'OLX', setup: ['PUBLICACAO', 'CAPTACAO'],
    prerequisites: ['Plano profissional OLX.'],
    hint: 'Você será direcionado à OLX para autorizar a conexão. Sua senha não é compartilhada conosco.',
  },
  {
    id: 'mercado_livre', name: 'Mercado Livre', category: 'PORTAIS', color: '#f5c400', aliases: ['ml', 'mercadolivre', 'mercado livre motors'],
    caps: { publication: 'HOMOLOGACAO', inventorySync: 'HOMOLOGACAO', receiveLeads: 'SIM', receiveMessages: 'EM_BREVE', sendMessages: 'EM_BREVE' },
    publicationChannel: 'MERCADO_LIVRE', leadChannelType: 'MERCADO_LIVRE', setup: ['PUBLICACAO', 'CAPTACAO'],
    prerequisites: ['Conta Mercado Livre com pacote de anúncios de veículos.'],
    hint: 'Você será direcionado ao Mercado Livre para autorizar a conexão. Sua senha não é compartilhada conosco.',
  },
  {
    id: 'icarros', name: 'iCarros', category: 'PORTAIS', color: '#ff5a00',
    caps: { publication: 'CONTRATO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO' },
    leadChannelType: 'ICARROS', setup: ['CAPTACAO', 'EMAIL_PARSER'],
    prerequisites: ['Acesso ao painel iCarros para trocar o e-mail de leads.'],
    hint: `${EMAIL_LEADS} Publicação automática depende de integração homologada com o iCarros.`,
  },
  {
    id: 'mobiauto', name: 'Mobiauto', category: 'PORTAIS', color: '#00b2a9',
    caps: { publication: 'HOMOLOGACAO', inventorySync: 'HOMOLOGACAO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO' },
    publicationChannel: 'MOBIAUTO', leadChannelType: 'MOBIAUTO', setup: ['PUBLICACAO', 'CAPTACAO', 'EMAIL_PARSER'],
    prerequisites: ['Conta de revenda Mobiauto.'],
    hint: 'Publicação pela API oficial da Mobiauto. Leads chegam pelo e-mail exclusivo do canal.',
  },
  {
    id: 'chaves_na_mao', name: 'Chaves na Mão', category: 'PORTAIS', color: '#f7941d',
    caps: { publication: 'HOMOLOGACAO', inventorySync: 'HOMOLOGACAO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO' },
    publicationChannel: 'CHAVES_NA_MAO', leadChannelType: 'USADOSBR', setup: ['PUBLICACAO', 'CAPTACAO', 'EMAIL_PARSER'],
    prerequisites: ['Contrato com o Chaves na Mão e token de integração.'],
    hint: 'O Chaves na Mão trabalha com integradores homologados. Leads chegam pelo e-mail exclusivo do canal.',
  },
  {
    id: 'napista', name: 'NaPista', category: 'PORTAIS', color: '#00a651',
    caps: { publication: 'CONTRATO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO' },
    leadChannelType: 'USADOSBR', setup: ['CAPTACAO', 'EMAIL_PARSER'],
    prerequisites: ['No painel NaPista, cadastre o e-mail exclusivo do canal como destino dos leads.'],
    hint: `${EMAIL_LEADS} O estoque do NaPista é integrado por integrador autorizado.`,
  },
  {
    id: 'usadosbr', name: 'UsadosBR', category: 'PORTAIS', color: '#1e88e5',
    caps: { publication: 'CONTRATO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO' },
    leadChannelType: 'USADOSBR', setup: ['CAPTACAO', 'EMAIL_PARSER'],
    prerequisites: ['Acesso ao painel UsadosBR.'],
    hint: `${EMAIL_LEADS} A API de leads da UsadosBR exige credencial específica da integração.`,
  },
  regional('autoline', 'Autoline', '#0d47a1'),
  regional('socarrao', 'SóCarrão', '#c62828'),
  regional('carrosp', 'CarroSP', '#283593'),
  regional('carro_brasil', 'Carro Brasil', '#2e7d32'),
  regional('meu_carro_novo', 'Meu Carro Novo', '#6a1b9a'),
  regional('vrum', 'Vrum', '#ef6c00'),
  regional('seminovosbh', 'SeminovosBH', '#00838f'),
  regional('comprecar', 'CompreCar', '#ad1457'),
  regional('veiculoaqui', 'VeículoAqui', '#4e342e'),
  regional('carro_interior_sp', 'Carro Interior SP', '#455a64'),
  regional('moto_com_br', 'Moto.com.br', '#bf360c'),
  {
    id: 'outros_portais', name: 'Outros portais', category: 'PORTAIS', color: '#64748b', aliases: ['regional', 'b2b', 'auto avaliar', 'marketplace'],
    caps: { publication: 'CONTRATO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO' },
    leadChannelType: 'USADOSBR', setup: ['CAPTACAO', 'EMAIL_PARSER'],
    prerequisites: ['Portal que avise leads por e-mail ou envie para um endereço da web.'],
    hint: 'Qualquer portal regional ou marketplace B2B: os leads entram pelo e-mail exclusivo ou pelo endereço de entrada.',
  },

  // ── Redes sociais ──────────────────────────────────────────────────────────
  {
    id: 'facebook', name: 'Facebook', category: 'REDES', color: '#1877f2', aliases: ['meta', 'lead ads', 'messenger'],
    caps: { publication: 'SIM', receiveLeads: 'SIM', receiveMessages: 'EM_BREVE', sendMessages: 'EM_BREVE', conversionPostback: 'EM_BREVE' },
    publicationChannel: 'META_PAGE', leadChannelType: 'FACEBOOK', setup: ['PUBLICACAO', 'CAPTACAO'],
    prerequisites: ['Página do Facebook da loja no Gerenciador de Negócios.'],
    hint: 'Posts na Página da loja e leads dos formulários de anúncio. Publicar no Marketplace não é permitido pela Meta a nenhum sistema.',
  },
  {
    id: 'instagram', name: 'Instagram', category: 'REDES', color: '#e1306c', aliases: ['meta', 'direct', 'ig'],
    caps: { publication: 'SIM', receiveLeads: 'SIM', receiveMessages: 'EM_BREVE', sendMessages: 'EM_BREVE' },
    publicationChannel: 'INSTAGRAM', leadChannelType: 'INSTAGRAM', setup: ['PUBLICACAO', 'CAPTACAO'],
    prerequisites: ['Conta profissional do Instagram ligada à Página do Facebook.'],
    hint: 'Posts, carrosséis, Stories e Reels da loja, e leads dos formulários de anúncio.',
  },
  {
    id: 'tiktok', name: 'TikTok', category: 'REDES', color: '#111111', aliases: ['tiktok ads', 'lead generation'],
    caps: { publication: 'HOMOLOGACAO', receiveLeads: 'SIM', receiveMessages: 'NAO', sendMessages: 'NAO', conversionPostback: 'EM_BREVE' },
    publicationChannel: 'TIKTOK', leadChannelType: 'TIKTOK', setup: ['PUBLICACAO', 'CAPTACAO'],
    prerequisites: ['Conta TikTok for Business.'],
    hint: 'Leads dos formulários instantâneos chegam direto. A publicação de vídeos aguarda a auditoria do TikTok.',
  },
  {
    id: 'kwai', name: 'Kwai', category: 'REDES', color: '#ff7a00',
    caps: { receiveLeads: 'SIM' }, leadChannelType: 'KWAI', setup: ['CAPTACAO'],
    prerequisites: ['Kwai for Business.'], hint: 'Leads dos formulários do Kwai pelo endereço de entrada do canal.',
  },
  {
    id: 'linkedin', name: 'LinkedIn', category: 'REDES', color: '#0a66c2',
    caps: { receiveLeads: 'SIM' }, leadChannelType: 'LINKEDIN', setup: ['CAPTACAO'],
    prerequisites: ['Formulários de geração de leads do LinkedIn.'], hint: 'Leads dos formulários do LinkedIn pelo endereço de entrada do canal.',
  },

  // ── Mensagens ──────────────────────────────────────────────────────────────
  {
    id: 'whatsapp', name: 'WhatsApp', category: 'MENSAGENS', color: '#25d366', aliases: ['whatsapp business', 'cloud api', 'zap'],
    caps: { receiveLeads: 'SIM', receiveMessages: 'SIM', sendMessages: 'SIM' },
    setup: ['WHATSAPP'],
    prerequisites: ['Número no WhatsApp Business Platform (API oficial da Meta).'],
    hint: 'Conversas dos clientes entram em CRM › Conversas e o vendedor responde dali, pelo número oficial da loja.',
  },
  {
    id: 'email_leads', name: 'E-mail de leads', category: 'MENSAGENS', color: '#0f766e', aliases: ['parser', 'email'],
    caps: { receiveLeads: 'SIM' }, setup: ['EMAIL_PARSER'],
    prerequisites: ['Um canal de captação criado (cada canal tem seu e-mail exclusivo).'],
    hint: 'Endereço exclusivo da loja para portais sem integração: o e-mail do lead vira lead no CRM, com o original guardado.',
  },
  {
    id: 'telefonia', name: 'Telefonia', category: 'MENSAGENS', color: '#7c3aed', aliases: ['ligação', 'pabx', '3cx', 'twilio', 'asterisk'],
    caps: { receiveLeads: 'SIM' }, setup: ['TELEFONIA'],
    prerequisites: ['Central telefônica compatível (3CX, Twilio, Asterisk ou genérica).'],
    hint: 'Ligações recebidas identificam o cliente e ficam registradas no lead.',
  },

  // ── Publicidade ────────────────────────────────────────────────────────────
  {
    id: 'google_ads', name: 'Google Ads', category: 'PUBLICIDADE', color: '#4285f4', aliases: ['youtube', 'gclid', 'formulário de lead'],
    caps: { receiveLeads: 'SIM', conversionPostback: 'EM_BREVE' },
    leadChannelType: 'GOOGLE_ADS', setup: ['CAPTACAO'],
    prerequisites: ['Conta Google Ads com formulário de lead.'],
    hint: 'Leads dos formulários do Google Ads e YouTube chegam direto, com a campanha registrada.',
  },
  {
    id: 'meta_ads', name: 'Anúncios Meta', category: 'PUBLICIDADE', color: '#0866ff', aliases: ['facebook ads', 'instagram ads', 'lead ads'],
    caps: { receiveLeads: 'SIM', conversionPostback: 'EM_BREVE' },
    leadChannelType: 'FACEBOOK', setup: ['CAPTACAO'],
    prerequisites: ['Gerenciador de Anúncios da Meta.'],
    hint: 'Leads de formulário instantâneo do Facebook e Instagram, com campanha, conjunto e anúncio.',
  },
  {
    id: 'rd_station', name: 'RD Station', category: 'PUBLICIDADE', color: '#19c1ce',
    caps: { receiveLeads: 'SIM' }, leadChannelType: 'RD_STATION', setup: ['CAPTACAO'],
    prerequisites: ['RD Station Marketing.'], hint: 'Conversões do RD Station viram leads no CRM.',
  },

  // ── Sites ──────────────────────────────────────────────────────────────────
  {
    id: 'site', name: 'Site da loja', category: 'SITES', color: '#0f172a', aliases: ['vitrine', 'landing page'],
    caps: { publication: 'SIM', inventorySync: 'SIM', receiveLeads: 'SIM' },
    publicationChannel: 'SITE', setup: ['SITE'],
    prerequisites: [],
    hint: 'O estoque aparece no site automaticamente e cada formulário vira lead, com a campanha de origem.',
  },
  {
    id: 'webhook_universal', name: 'Endereço de entrada universal', category: 'SITES', color: '#334155', aliases: ['webhook', 'api', 'zapier', 'make', 'n8n', 'parceiro', 'agência'],
    caps: { receiveLeads: 'SIM' }, leadChannelType: 'GENERIC', setup: ['CAPTACAO'],
    prerequisites: [],
    hint: 'Para landing pages, agências, parceiros e ferramentas como Zapier, Make e n8n enviarem leads.',
  },
]

export const hubItem = (id: string) => HUB_CATALOG.find((i) => i.id === id) ?? null

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Busca por nome, apelido ou categoria. */
export function searchHub(items: HubItem[], q: string): HubItem[] {
  const t = fold(q.trim())
  if (!t) return items
  return items.filter((i) => [i.name, ...(i.aliases ?? []), HUB_CATEGORY_LABEL[i.category]].some((x) => fold(x).includes(t)))
}

export type Availability = 'DISPONIVEL' | 'EM_HOMOLOGACAO' | 'REQUER_CONTRATO' | 'EM_BREVE'

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  DISPONIVEL: 'Disponível',
  EM_HOMOLOGACAO: 'Em homologação',
  REQUER_CONTRATO: 'Requer contrato com o portal',
  EM_BREVE: 'Em breve',
}

/** Disponibilidade do canal = a melhor capacidade que ele tem hoje. */
export function availabilityOf(item: Pick<HubItem, 'caps'>): Availability {
  const states = Object.values(item.caps)
  if (states.includes('SIM')) return 'DISPONIVEL'
  if (states.includes('HOMOLOGACAO')) return 'EM_HOMOLOGACAO'
  if (states.includes('CONTRATO')) return 'REQUER_CONTRATO'
  return 'EM_BREVE'
}

/** Estado da publicação vindo da Central de Publicações (fonte única). */
export function publicationCapFrom(spec: { devStatus: string; verified: string } | null | undefined, fallback: CapState): CapState {
  if (!spec) return fallback
  if (spec.devStatus === 'EM_AVALIACAO' || spec.devStatus === 'EM_DESENVOLVIMENTO') return 'CONTRATO'
  if (spec.verified === 'PRODUCAO' || (spec.devStatus === 'DISPONIVEL' && spec.verified !== 'NENHUM')) return 'SIM'
  return 'HOMOLOGACAO'
}

// ── Estado da conexão da loja ────────────────────────────────────────────────

export type ConnectionState = 'CONECTADO' | 'CONFIGURACAO_NECESSARIA' | 'ATENCAO' | 'DESCONECTADO'

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  CONECTADO: 'Conectado',
  CONFIGURACAO_NECESSARIA: 'Configuração necessária',
  ATENCAO: 'Atenção',
  DESCONECTADO: 'Desconectado',
}

export interface PartStatus {
  kind: SetupKind
  state: ConnectionState
  /** Texto curto para o lojista (o que está acontecendo / o que fazer). */
  message: string
  lastActivityAt?: string | null
}

/** Junta as partes: qualquer atenção > tudo conectado > alguma parte conectada > nada. */
export function combineState(parts: PartStatus[]): ConnectionState {
  if (!parts.length) return 'DESCONECTADO'
  if (parts.some((p) => p.state === 'ATENCAO')) return 'ATENCAO'
  const connected = parts.filter((p) => p.state === 'CONECTADO').length
  if (connected === parts.length) return 'CONECTADO'
  if (connected > 0) return 'CONECTADO'
  if (parts.some((p) => p.state === 'CONFIGURACAO_NECESSARIA')) return 'CONFIGURACAO_NECESSARIA'
  return 'DESCONECTADO'
}
