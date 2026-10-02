// =============================================================================
// Chave do armazenamento de vídeos (Vercel Blob). A Vercel cria a variável
// BLOB_READ_WRITE_TOKEN ao conectar o armazenamento ao projeto — mas deixa
// escolher outro prefixo (ex.: VIDEOS_READ_WRITE_TOKEN). Aceita qualquer
// variável cujo valor seja uma chave do Blob (vercel_blob_rw_…).
// =============================================================================

export function blobToken(): string | undefined {
  const direct = process.env.BLOB_READ_WRITE_TOKEN
  if (direct) return direct
  for (const [k, v] of Object.entries(process.env)) {
    if (v && /READ_WRITE_TOKEN$/.test(k) && v.startsWith('vercel_blob_rw_')) return v
  }
  for (const v of Object.values(process.env)) if (v && v.startsWith('vercel_blob_rw_')) return v
  return undefined
}
