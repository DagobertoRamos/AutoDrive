// =============================================================================
// CRM — Atribuição de marketing. PURO (testado).
// Cada entrada do cliente (lead de portal, formulário, anúncio, mensagem) é um
// "toque". O lead guarda, em metadata.attribution:
//   • firstTouch  — o primeiro canal/campanha que trouxe o cliente (nunca muda);
//   • lastTouch   — o mais recente (atualiza a cada retorno);
//   • touches     — histórico (últimos 20).
// O canal que criou a oportunidade é o `source` do lead; o que converteu é
// gravado na conversão. Um não substitui o outro.
// =============================================================================

export interface Touch {
  at: string
  /** Origem no CRM (FACEBOOK, WEBMOTORS, SITE, WHATSAPP...). */
  source: string
  channelId?: string
  channelName?: string
  campaign?: string
  campaignId?: string
  adsetId?: string
  adId?: string
  adName?: string
  formId?: string
  formName?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  gclid?: string
  gbraid?: string
  wbraid?: string
  fbclid?: string
  ttclid?: string
  msclkid?: string
  landingPage?: string
  referrer?: string
  /** Id do anúncio no portal (liga o lead ao veículo interno). */
  externalListingId?: string
  /** Id do lead na plataforma (leadgen_id, id do lead do portal...). */
  platformLeadId?: string
  correlationId?: string
}

export interface Attribution {
  firstTouch: Touch
  lastTouch: Touch
  touches: Touch[]
}

const MAX_TOUCHES = 20
const fold = (k: string) => k.normalize('NFD').replace(/\p{M}/gu, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/** Nome de campo (em qualquer formato) → campo do toque. */
const FIELD_KEYS: Record<Exclude<keyof Touch, 'at' | 'source' | 'channelId' | 'channelName' | 'correlationId'>, string[]> = {
  campaign: ['campaign_name', 'campaign', 'campanha', 'nome_campanha'],
  campaignId: ['campaign_id', 'id_campanha'],
  adsetId: ['adset_id', 'ad_group_id', 'adgroup_id', 'conjunto_id'],
  adId: ['ad_id', 'creative_id', 'id_anuncio_ads'],
  adName: ['ad_name', 'nome_anuncio', 'creative_name'],
  formId: ['form_id', 'formulario_id'],
  formName: ['form_name', 'formulario', 'nome_formulario'],
  utmSource: ['utm_source'],
  utmMedium: ['utm_medium'],
  utmCampaign: ['utm_campaign'],
  utmContent: ['utm_content'],
  utmTerm: ['utm_term'],
  gclid: ['gclid'],
  gbraid: ['gbraid'],
  wbraid: ['wbraid'],
  fbclid: ['fbclid'],
  ttclid: ['ttclid'],
  msclkid: ['msclkid'],
  landingPage: ['landing_page', 'page_url', 'pagina', 'url'],
  referrer: ['referrer', 'referer', 'http_referer'],
  externalListingId: ['listing_id', 'ad_listing_id', 'id_anuncio', 'anuncio_id', 'codigo_anuncio', 'item_id', 'advert_id', 'list_id'],
  platformLeadId: ['leadgen_id', 'lead_id', 'id_lead'],
}

const clean = (v: unknown, max = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '')

/** Extrai os dados de atribuição de um conjunto chave→valor (qualquer formato de chave). */
export function extractTouch(values: Record<string, unknown>, base: Pick<Touch, 'source'> & Partial<Touch>, now = new Date()): Touch {
  const byKey = new Map<string, string>()
  for (const [k, v] of Object.entries(values)) {
    const s = clean(v)
    if (s) { const f = fold(k); if (!byKey.has(f)) byKey.set(f, s) }
  }
  const t: Touch = { at: now.toISOString(), ...base }
  for (const [field, keys] of Object.entries(FIELD_KEYS) as [keyof typeof FIELD_KEYS, string[]][]) {
    if (t[field]) continue
    for (const k of keys) { const v = byKey.get(k); if (v) { t[field] = v; break } }
  }
  // Parâmetros de campanha dentro da URL da página (utm_*, gclid...).
  if (t.landingPage) {
    try {
      const u = new URL(t.landingPage)
      for (const [field, keys] of Object.entries(FIELD_KEYS) as [keyof typeof FIELD_KEYS, string[]][]) {
        if (t[field] || field === 'landingPage') continue
        if (!/^(utm|gclid|gbraid|wbraid|fbclid|ttclid|msclkid)/.test(keys[0])) continue
        const v = u.searchParams.get(keys[0])
        if (v) t[field] = v.slice(0, 300)
      }
    } catch { /* URL inválida: ignora */ }
  }
  return compact(t)
}

function compact(t: Touch): Touch {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== '')) as unknown as Touch
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Lê a atribuição gravada no metadata do lead (ou null). */
export function readAttribution(metadata: unknown): Attribution | null {
  const a = obj(obj(metadata).attribution)
  if (!a.firstTouch || !a.lastTouch) return null
  return { firstTouch: a.firstTouch as Touch, lastTouch: a.lastTouch as Touch, touches: Array.isArray(a.touches) ? (a.touches as Touch[]) : [] }
}

/** Soma um toque: o primeiro fica, o último é trocado e o histórico cresce (limitado). */
export function addTouch(current: Attribution | null, touch: Touch): Attribution {
  if (!current) return { firstTouch: touch, lastTouch: touch, touches: [touch] }
  return { firstTouch: current.firstTouch, lastTouch: touch, touches: [...current.touches, touch].slice(-MAX_TOUCHES) }
}

/** Rótulo curto do toque para telas ("Facebook · campanha Feirão"). */
export function touchLabel(t: Touch | null | undefined, sourceLabel: (code: string) => string = (c) => c): string {
  if (!t) return ''
  const parts = [t.channelName || sourceLabel(t.source)]
  const camp = t.campaign || t.utmCampaign
  if (camp) parts.push(`campanha ${camp}`)
  if (t.adName) parts.push(`anúncio ${t.adName}`)
  return parts.join(' · ')
}
