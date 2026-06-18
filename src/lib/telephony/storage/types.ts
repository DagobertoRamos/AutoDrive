// =============================================================================
// telephony/storage/types.ts — abstração ABERTA de storage de gravações.
// Vários provedores plugáveis (S3-compatível, URL externa, e futuros GCS/Azure/
// Blob). Cada provider declara se sabe lidar com a referência e como servir o
// áudio (presign→redirect, externo→proxy). Nenhuma rede aqui além do provider.
// =============================================================================

export type PlaybackSource =
  | { kind: 'redirect'; url: string }   // URL pronta (ex.: presigned) — 302
  | { kind: 'proxy'; url: string }      // buscar server-side e repassar (anti-SSRF)
  | { kind: 'unavailable'; reason: string }

export interface RecordingStorageProvider {
  /** Identificador do provedor (s3, external, gcs, azure, blob, ...). */
  readonly kind: string
  /** true se este provider está configurado e pronto para uso. */
  readonly ready: boolean
  /** true se este provider sabe ARMAZENAR objetos (destino de arquivamento). */
  readonly writable: boolean
  /** true se a referência (storageUrl/chave) pertence a este provider. */
  canHandle(ref: string): boolean
  /** Como servir a gravação a partir da referência (TTL em segundos). */
  getPlayback(ref: string, ttlSeconds: number, nowMs?: number): PlaybackSource
  /** Armazena bytes e devolve a referência canônica (ex.: `s3://bucket/key`). */
  putObject?(key: string, body: Uint8Array, contentType: string): Promise<string>
}
