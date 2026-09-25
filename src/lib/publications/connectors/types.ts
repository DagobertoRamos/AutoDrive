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
  /** Grava segredos renovados (token novo) — cifrado pelo serviço. */
  saveSecrets: (s: Secrets, expiresAt?: Date | null) => Promise<void>
  now: () => Date
}

export interface RemoteRef {
  vehicleId: string
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
