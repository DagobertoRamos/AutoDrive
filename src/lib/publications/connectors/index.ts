// Registro dos conectores implementados. Canal do catálogo sem conector aqui
// = sem envio automático (em avaliação, feed ou manual).

import type { ChannelId } from '../channels'
import { chavesNaMaoConnector } from './chavesnamao'
import { mercadoLivreConnector } from './mercadolivre'
import { mobiautoConnector } from './mobiauto'
import { instagramConnector, metaPageConnector } from './meta'
import { olxConnector } from './olx'
import { siteConnector } from './site'
import type { Connector } from './types'
import { webmotorsConnector } from './webmotors'

const REGISTRY: Partial<Record<ChannelId, Connector>> = {
  SITE: siteConnector,
  WEBMOTORS: webmotorsConnector,
  OLX: olxConnector,
  MERCADO_LIVRE: mercadoLivreConnector,
  CHAVES_NA_MAO: chavesNaMaoConnector,
  MOBIAUTO: mobiautoConnector,
  META_PAGE: metaPageConnector,
  INSTAGRAM: instagramConnector,
}

export function getConnector(channel: string): Connector | null {
  return REGISTRY[channel as ChannelId] ?? null
}

/** Canal publicado à mão pela loja (exportação de fotos e texto). */
export const isManualChannel = (channel: string) => channel === 'MANUAL_SOCIAL'
