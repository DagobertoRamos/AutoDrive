// =============================================================================
// telephony/storage/registry.ts — resolve o provider de storage da gravação.
// ABERTO a vários storages: registre novos providers no array `PROVIDERS`
// (S3-compatível já cobre AWS/R2/Spaces/MinIO/Wasabi/B2; GCS/Azure/Blob podem
// ser adicionados implementando RecordingStorageProvider). A escolha é pela
// referência (`s3://…`, `https://…`, chave crua) via `canHandle`.
// =============================================================================

import type { RecordingStorageProvider, PlaybackSource } from './types'
import { S3StorageProvider } from './s3.provider'
import { ExternalUrlStorageProvider } from './external.provider'

// Ordem importa: S3 (esquema s3:// ou chave crua) antes do externo (http/https).
const PROVIDERS: RecordingStorageProvider[] = [
  new S3StorageProvider(),
  new ExternalUrlStorageProvider(),
]

export function listStorageProviders(): { kind: string; ready: boolean }[] {
  return PROVIDERS.map((p) => ({ kind: p.kind, ready: p.ready }))
}

export function getStorageProviderFor(ref: string): RecordingStorageProvider | null {
  return PROVIDERS.find((p) => p.canHandle(ref)) ?? null
}

/** Decide como servir a gravação a partir da referência registrada. */
export function resolveRecordingSource(ref: string | null | undefined, ttlSeconds = 300, nowMs: number = Date.now()): PlaybackSource {
  if (!ref) return { kind: 'unavailable', reason: 'Gravação sem arquivo associado.' }
  const provider = getStorageProviderFor(ref)
  if (!provider) return { kind: 'unavailable', reason: 'Nenhum storage configurado para esta gravação.' }
  if (!provider.ready) return { kind: 'unavailable', reason: `Storage "${provider.kind}" não configurado.` }
  return provider.getPlayback(ref, ttlSeconds, nowMs)
}
