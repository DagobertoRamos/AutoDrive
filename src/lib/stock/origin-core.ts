// =============================================================================
// Origem do veículo — PURO (testado).
//   OWN     estoque próprio da loja
//   PARTNER loja parceira (lojista cujo carro a loja anuncia)
//   PRIVATE particular intermediado (consignação de pessoa física)
// Mesmo modelo do site antigo (vehicle-origin.ts), para a tag pública do site.
// =============================================================================

export const ORIGIN_TYPES = ['OWN', 'PARTNER', 'PRIVATE'] as const
export type OriginType = (typeof ORIGIN_TYPES)[number]

export const ORIGIN_LABEL: Record<OriginType, string> = {
  OWN:     'Estoque próprio',
  PARTNER: 'Fornecedor (lojista parceiro)',
  PRIVATE: 'Particular',
}

export function normalizeOrigin(v: unknown): OriginType | null {
  const s = String(v ?? '').trim().toUpperCase()
  if ((ORIGIN_TYPES as readonly string[]).includes(s)) return s as OriginType
  if (['PARCEIRO', 'PARCEIRA', 'LOJISTA', 'PARTNERS'].includes(s)) return 'PARTNER'
  if (['PARTICULAR', 'CONSIGNADO_PF'].includes(s)) return 'PRIVATE'
  if (['PROPRIO', 'PRÓPRIO', 'ESTOQUE'].includes(s)) return 'OWN'
  return null
}

/** Origem efetiva: informada; senão deduz (tem parceiro → PARTNER; consignado → PRIVATE; senão OWN). */
export function effectiveOrigin(v: { originType?: string | null; partnerStoreId?: string | null; stockType?: string | null }): OriginType {
  const o = normalizeOrigin(v.originType)
  if (o) return o
  if (v.partnerStoreId) return 'PARTNER'
  if (String(v.stockType ?? '').toUpperCase() === 'CONSIGNADO') return 'PRIVATE'
  return 'OWN'
}

/** Tipo de estoque coerente com a origem: só o próprio é PROPRIO. */
export function stockTypeForOrigin(o: OriginType): 'PROPRIO' | 'CONSIGNADO' {
  return o === 'OWN' ? 'PROPRIO' : 'CONSIGNADO'
}

/** Tag pública no site. `storeName` = nome da loja (identidade do site). */
export function originPublicTag(o: OriginType, storeName?: string | null): string {
  if (o === 'PARTNER') return 'Lojista parceiro'
  if (o === 'PRIVATE') return 'Particular intermediado'
  const name = String(storeName ?? '').trim()
  return name ? `Estoque ${name}` : 'Estoque próprio'
}

/** Valida o par origem/parceiro vindo de formulário. */
export function validateOriginInput(input: { originType?: unknown; partnerStoreId?: unknown }):
  { ok: true; originType: OriginType; partnerStoreId: string | null } | { ok: false; error: string } {
  const originType = normalizeOrigin(input.originType)
  if (!originType) return { ok: false, error: 'Escolha a origem: estoque próprio, loja parceira ou particular.' }
  const partnerStoreId = typeof input.partnerStoreId === 'string' && input.partnerStoreId.trim() ? input.partnerStoreId.trim() : null
  if (originType === 'PARTNER' && !partnerStoreId) return { ok: false, error: 'Escolha o fornecedor do veículo.' }
  return { ok: true, originType, partnerStoreId: originType === 'PARTNER' ? partnerStoreId : null }
}

/** Chave de importação estável para parceiro vindo só pelo nome (feed). */
export function partnerRefFromName(name: string): string {
  return 'nome:' + name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export interface FeedOriginLike {
  internalCode?: string | null; originType?: string | null
  partnerName?: string | null; partnerCity?: string | null; partnerWhatsapp?: string | null
}
export interface PartnerLike { id: string; name: string; city?: string | null; whatsapp?: string | null }

/** Origem exibida no painel: cadastro do SaaS (originType + loja parceira) prevalece sobre o feed do site antigo. */
export function mergeOrigin<F extends FeedOriginLike>(feed: F | null, v: { originType?: string | null; partnerStore?: PartnerLike | null }) {
  const partner = v.partnerStore ?? null
  if (!feed && !v.originType && !partner) return null
  const originType = v.originType ?? feed?.originType ?? null
  const isPartner = String(originType ?? '').toUpperCase() === 'PARTNER'
  return {
    ...(feed ?? {}),
    internalCode:    feed?.internalCode ?? null,
    originType,
    partnerStoreId:  partner?.id ?? null,
    partnerName:     isPartner ? partner?.name ?? feed?.partnerName ?? null : null,
    partnerCity:     isPartner ? partner?.city ?? feed?.partnerCity ?? null : null,
    partnerWhatsapp: isPartner ? partner?.whatsapp ?? feed?.partnerWhatsapp ?? null : null,
  }
}
