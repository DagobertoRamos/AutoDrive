// =============================================================================
// telephony/storage/index.ts — exportações públicas da camada de storage.
// =============================================================================

export * from './types'
export { resolveRecordingSource, getStorageProviderFor, listStorageProviders } from './registry'
export { isSafeExternalUrl, ExternalUrlStorageProvider } from './external.provider'
export { S3StorageProvider, presignGet, parseS3Ref } from './s3.provider'
