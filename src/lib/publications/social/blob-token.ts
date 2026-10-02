// =============================================================================
// Credencial do armazenamento de vídeos (Vercel Blob). Dois formatos:
//   • novo: a Vercel cria BLOB_STORE_ID e autentica sozinha (OIDC) — envio do
//     navegador por URL pré-assinada;
//   • antigo: chave BLOB_READ_WRITE_TOKEN (ou outro prefixo escolhido ao
//     conectar, ex.: VIDEOS_READ_WRITE_TOKEN) — envio por token de cliente.
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

/** Como o navegador envia: 'presigned' (BLOB_STORE_ID), 'token' (chave antiga) ou null (desligado). */
export function blobMode(): 'presigned' | 'token' | null {
  if (process.env.BLOB_STORE_ID) return 'presigned'
  return blobToken() ? 'token' : null
}

/** Opções de autenticação para del/list/get no servidor (a chave antiga, se houver; senão o SDK usa o BLOB_STORE_ID). */
export function blobAuth(): { token?: string } {
  const t = process.env.BLOB_STORE_ID ? undefined : blobToken()
  return t ? { token: t } : {}
}
