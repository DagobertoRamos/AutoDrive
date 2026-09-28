// =============================================================================
// Contrato dos conectores — independente da interface e do banco.
// Cada conector declara as capacidades REAIS (channels.ts) e implementa só o
// que o canal oferece. Operação não suportada = ConnectorError('UNSUPPORTED').
// =============================================================================

import type { ChannelSpec } from '../channels'
import type { ListingPayload } from '../content-core'
import type { Issue } from '../validate-core'
import type { RemoteState } from '../states'
import type { HttpClient } from './http'
import type { ArtTemplate, SocialFormat } from '../social/formats'

export interface ConnectionInfo {
  id: string
  tenantId: string
  externalAccountId: string
  environment: 'PRODUCAO' | 'HOMOLOGACAO'
  config: Record<string, unknown>
}

/** Segredos decifrados só no momento da chamada. Nunca logar. */
export type Secrets = Record<string, string>

export interface MappingResolver {
  /** Código do canal para um valor do estoque; null = sem correspondência segura (vira pendência "revisar"). */
  resolve(kind: string, sourceKey: string, sourceLabel: string, lookup: () => Promise<Array<{ id: string; label: string }>>, pick?: (c: Array<{ id: string; label: string }>) => { id: string; label: string } | null): Promise<{ id: string; label: string } | null>
}

export interface ConnectorContext {
  connection: ConnectionInfo
  secrets: Secrets
  http: HttpClient
  mapping: MappingResolver
  /** URL pública assinada da foto (variante JPEG). */
  mediaUrl: (photoUrl: string) => string
  /** Estúdio social (Instagram/Facebook): arte desenhada e vídeo do Reels. */
  social?: SocialMedia
  /** Grava segredos renovados (token novo) — cifrado pelo serviço. */
  saveSecrets: (s: Secrets, expiresAt?: Date | null) => Promise<void>
  now: () => Date
}

export interface SocialMedia {
  /** URL pública da arte do formato sobre a foto (preço do anúncio já aplicado). */
  artUrl(photoUrl: string, p: ListingPayload, format: SocialFormat, template: ArtTemplate): string
  /**
   * Gera e guarda o vídeo (REELS = todas as fotos; CLIP = uma arte com zoom):
   * URL pública do MP4 (Instagram baixa) e os bytes (Facebook recebe o
   * arquivo direto). `embedMusic`: embute a trilha CC0 escolhida.
   */
  video(p: ListingPayload, kind: 'REELS' | 'CLIP', opts: { format: SocialFormat; template: ArtTemplate; embedMusic: boolean }): Promise<{ url: string; bytes: Uint8Array }>
  /** Vídeo gravado do carro (link do anúncio) ajustado para Reels: bytes do MP4. */
  carVideo(p: ListingPayload): Promise<Uint8Array>
}

export interface RemoteRef {
  vehicleId: string
  /** Formato social da publicação (Story/Reels mudam a consulta e a remoção). */
  format?: SocialFormat | null
  /** A publicação é um vídeo (Reels ou Post com música na Página): consulta pelo status do vídeo. */
  video?: boolean
  remoteId: string | null
  externalRef: string
  remoteUrl?: string | null
  pendingToken?: string | null
}

export interface RemoteResult {
  state: RemoteState
  remoteId?: string | null
  remoteUrl?: string | null
  pendingToken?: string | null
  remoteStatus?: string | null
  message?: string | null
  /** Dados úteis para diagnóstico (sem segredo). */
  data?: Record<string, unknown>
}

export interface Connector {
  spec: ChannelSpec
  /** Pendências específicas (ex.: mapeamento de versão) além da validação comum. */
  validate?(p: ListingPayload, ctx: ConnectorContext): Promise<Issue[]>
  testConnection?(ctx: ConnectorContext): Promise<{ ok: boolean; message: string; account?: string; quota?: Record<string, unknown> }>
  publish?(p: ListingPayload, ctx: ConnectorContext): Promise<RemoteResult>
  /** Consulta o estado atual no canal. */
  get?(ref: RemoteRef, ctx: ConnectorContext): Promise<RemoteResult>
  /** Depois de timeout: procura o anúncio pela NOSSA referência antes de criar de novo. */
  findByReference?(ref: RemoteRef, p: ListingPayload | null, ctx: ConnectorContext): Promise<RemoteResult | null>
  update?(ref: RemoteRef, p: ListingPayload, ctx: ConnectorContext): Promise<RemoteResult>
  pause?(ref: RemoteRef, ctx: ConnectorContext): Promise<RemoteResult>
  resume?(ref: RemoteRef, p: ListingPayload, ctx: ConnectorContext): Promise<RemoteResult>
  remove?(ref: RemoteRef, reason: 'VENDIDO' | 'RETIRADO' | 'MANUAL', ctx: ConnectorContext): Promise<RemoteResult>
  limits?(ctx: ConnectorContext): Promise<Record<string, unknown>>
}
