// =============================================================================
// Catálogo de serviços de integração — descreve QUAIS CAMPOS cada serviço
// expõe no formulário. Evita formulário genérico que mistura campos.
//
// FIPE_PROVIDER (Parallelum) → apenas apiUrl + apiKey (Subscription Token)
// PLATE_LOOKUP                → apiUrl + apiKey (Bearer) [+ token alternativo]
// BRASILAPI                   → apiUrl (pública, sem token)
// STORAGE                     → apiUrl + apiKey + apiSecret + token
// PAYMENT_GATEWAY/DIGITAL_SIGN→ apiUrl + apiKey + apiSecret + webhookSecret
// Outros legados              → genérico (mantido para compatibilidade)
// =============================================================================

export type ServiceKey =
  | 'FIPE_PROVIDER'
  | 'PLATE_LOOKUP'
  | 'BRASILAPI'
  | 'STORAGE'
  | 'PAYMENT_GATEWAY'
  | 'DIGITAL_SIGN'
  | 'MAPS'
  | 'RENAVAM'
  | 'CNPJ_LOOKUP'   // legado
  | 'CEP'           // legado
  | 'FIPE'          // legado
  | 'PUB_MERCADO_LIVRE' // app da plataforma no DevCenter (Central de Publicações)
  | 'PUB_OLX'           // app registrado com a OLX (autoupload)
  | 'PUB_META'          // app Meta (Página + Instagram)
  | 'PUB_MOBIAUTO'      // app OAuth da Mobiauto Open API
  | 'OTHER'

export type FieldKey =
  | 'apiUrl'
  | 'apiKey'
  | 'apiSecret'
  | 'token'
  | 'username'
  | 'webhookSecret'

export interface ServiceDef {
  key:           ServiceKey
  label:         string
  defaultUrl?:   string
  description?:  string
  fields:        FieldKey[]               // ordem de exibição
  fieldLabels?:  Partial<Record<FieldKey, string>>
  fieldHints?:   Partial<Record<FieldKey, string>>
  fieldRequired?:Partial<Record<FieldKey, boolean>>
  /** Validador de URL base — retorna mensagem de erro ou null se OK. */
  validateUrl?:  (url: string) => string | null
  /** Se true, não permite criar novas credenciais (legado) — apenas editar/excluir as existentes. */
  legacy?:       boolean
  badgeColor:    string  // classes Tailwind do card
}

export const SERVICES: ServiceDef[] = [
  {
    key:         'FIPE_PROVIDER',
    label:       'FIPE Parallelum',
    defaultUrl:  'https://fipe.parallelum.com.br/api/v2',
    description: 'Consulta tabela FIPE oficial via Parallelum/Fipe Online. NÃO consulta placa.',
    fields:      ['apiUrl', 'apiKey'],
    fieldLabels: { apiKey: 'Subscription Token (X-Subscription-Token)' },
    fieldHints:  {
      apiUrl: 'Use https://fipe.parallelum.com.br/api/v2',
      apiKey: 'Token de assinatura emitido pela Parallelum. Enviado no header X-Subscription-Token.',
    },
    fieldRequired: { apiKey: true },
    validateUrl: (url) => {
      if (!url) return null
      if (!/^https?:\/\/fipe\.parallelum\.com\.br/i.test(url)) {
        return 'URL inválida para FIPE Parallelum. Use https://fipe.parallelum.com.br/api/v2'
      }
      return null
    },
    badgeColor:  'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    key:         'PLATE_LOOKUP',
    label:       'Consulta de Placa',
    defaultUrl:  'https://wdapi2.com.br',
    description: 'Provedor externo de consulta veicular. Para API Placas (wdapi2.com.br) preencha apiUrl = https://wdapi2.com.br e cole o token no campo "Token". Outros provedores (Cilia, Placafipe) usam apiKey.',
    fields:      ['apiUrl', 'apiKey', 'token'],
    fieldLabels: {
      apiUrl: 'Base URL do provedor',
      apiKey: 'API Key (Cilia/Placafipe — opcional para wdapi2)',
      token:  'Token (obrigatório para API Placas/wdapi2)',
    },
    fieldHints: {
      apiUrl: 'API Placas: https://wdapi2.com.br',
      token:  'Cole aqui o token recebido por e-mail ao contratar API Placas.',
    },
    fieldRequired: { apiUrl: true },
    badgeColor:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    key:         'BRASILAPI',
    label:       'BrasilAPI (CEP / CNPJ / Bancos)',
    defaultUrl:  'https://brasilapi.com.br',
    description: 'API pública gratuita. Sem token necessário. NÃO confundir com APIs de placa (PlacaFipe, Cilia) — essas vão em "Consulta de Placa".',
    fields:      ['apiUrl'],
    fieldHints:  { apiUrl: 'Use https://brasilapi.com.br (os endpoints /api/cep/v1, /api/cnpj/v1 e /api/banks/v1 são acrescentados automaticamente)' },
    validateUrl: (url) => {
      if (!url) return null  // permite vazio (cai no default)
      if (!/^https?:\/\/[^/]*brasilapi\.com\.br(\/|$)/i.test(url)) {
        return 'URL inválida para BrasilAPI. Use https://brasilapi.com.br. Não use URLs de placa (PlacaFipe, Cilia, etc) aqui — essas vão em "Consulta de Placa".'
      }
      return null
    },
    badgeColor:  'bg-green-50 text-green-700 border-green-200',
  },
  {
    key:         'STORAGE',
    label:       'Storage (S3 / R2 / Supabase)',
    fields:      ['apiUrl', 'apiKey', 'apiSecret', 'token'],
    fieldLabels: { apiKey: 'Access Key', apiSecret: 'Secret Key', token: 'Session Token (opcional)' },
    badgeColor:  'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    key:         'PAYMENT_GATEWAY',
    label:       'Gateway de Pagamento',
    fields:      ['apiUrl', 'apiKey', 'apiSecret', 'webhookSecret'],
    badgeColor:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    key:         'DIGITAL_SIGN',
    label:       'Assinatura Digital',
    fields:      ['apiUrl', 'apiKey', 'webhookSecret'],
    badgeColor:  'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    key:         'MAPS',
    label:       'Mapas / Geolocalização',
    fields:      ['apiUrl', 'apiKey'],
    badgeColor:  'bg-red-50 text-red-700 border-red-200',
  },
  {
    key:         'RENAVAM',
    label:       'RENAVAM / SERPRO',
    fields:      ['apiUrl', 'apiKey', 'token', 'username'],
    badgeColor:  'bg-purple-50 text-purple-700 border-purple-200',
  },
  // ── Legados — escondidos do dropdown de criação, mas mantidos na listagem ──
  {
    key:         'FIPE',
    label:       'FIPE (legado)',
    fields:      ['apiUrl', 'apiKey'],
    legacy:      true,
    badgeColor:  'bg-gray-100 text-gray-600 border-gray-200',
  },
  {
    key:         'CNPJ_LOOKUP',
    label:       'CNPJ (legado)',
    fields:      ['apiUrl', 'apiKey'],
    legacy:      true,
    badgeColor:  'bg-gray-100 text-gray-600 border-gray-200',
  },
  {
    key:         'CEP',
    label:       'CEP (legado)',
    fields:      ['apiUrl'],
    legacy:      true,
    badgeColor:  'bg-gray-100 text-gray-600 border-gray-200',
  },
  // ── Central de Publicações: apps DA PLATAFORMA (cada loja autoriza a própria conta) ──
  {
    key:         'PUB_MERCADO_LIVRE',
    label:       'Publicações — Mercado Livre (app)',
    description: 'App criado em developers.mercadolivre.com.br › Minhas aplicações. URI de redirect: https://www.appautodrive.online/api/publications/oauth/mercado-livre/callback · Notificações (tópico items): https://www.appautodrive.online/api/webhook/publications/mercado-livre',
    fields:      ['apiKey', 'apiSecret'],
    fieldLabels: { apiKey: 'Client ID (App ID)', apiSecret: 'Client Secret' },
    fieldRequired: { apiKey: true, apiSecret: true },
    badgeColor:  'bg-yellow-50 text-yellow-800 border-yellow-200',
  },
  {
    key:         'PUB_OLX',
    label:       'Publicações — OLX (app)',
    description: 'client_id e segredo enviados pela OLX após o registro com suporteintegrador@olxbr.com. URI de redirect a informar: https://www.appautodrive.online/api/publications/oauth/olx/callback',
    fields:      ['apiKey', 'apiSecret'],
    fieldLabels: { apiKey: 'client_id', apiSecret: 'Chave de segurança (client_secret)' },
    fieldRequired: { apiKey: true, apiSecret: true },
    badgeColor:  'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    key:         'PUB_META',
    label:       'Publicações — Meta: Facebook e Instagram (app)',
    description: 'App em developers.facebook.com (Facebook Login for Business). URI de redirect OAuth válida: https://www.appautodrive.online/api/publications/oauth/meta/callback',
    fields:      ['apiKey', 'apiSecret'],
    fieldLabels: { apiKey: 'App ID', apiSecret: 'App Secret' },
    fieldRequired: { apiKey: true, apiSecret: true },
    badgeColor:  'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    key:         'PUB_MOBIAUTO',
    label:       'Publicações — Mobiauto (app)',
    description: 'client_id e segredo da Mobiauto Open API (pedir a openapi@mobiauto.com.br). URI de redirect a informar: https://www.appautodrive.online/api/publications/oauth/mobiauto/callback',
    fields:      ['apiKey', 'apiSecret'],
    fieldLabels: { apiKey: 'client_id', apiSecret: 'client_secret' },
    fieldRequired: { apiKey: true, apiSecret: true },
    badgeColor:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    key:         'OTHER',
    label:       'Outro',
    fields:      ['apiUrl', 'apiKey', 'apiSecret', 'token', 'username', 'webhookSecret'],
    badgeColor:  'bg-gray-100 text-gray-600 border-gray-200',
  },
]

export function getServiceDef(key: string | undefined | null): ServiceDef | undefined {
  if (!key) return undefined
  return SERVICES.find((s) => s.key === key)
}

/** Labels padrão por campo (caso o serviço não sobrescreva). */
export const DEFAULT_FIELD_LABELS: Record<FieldKey, string> = {
  apiUrl:        'URL base da API',
  apiKey:        'API Key',
  apiSecret:     'API Secret',
  token:         'Token / Bearer',
  username:      'Usuário (Basic Auth)',
  webhookSecret: 'Webhook Secret',
}

/** Fields sensíveis que devem ser mascarados e nunca pré-populados no input. */
export const SENSITIVE_FIELDS: FieldKey[] = ['apiKey', 'apiSecret', 'token', 'webhookSecret']

export function isSensitiveField(k: string): k is FieldKey {
  return (SENSITIVE_FIELDS as string[]).includes(k)
}
