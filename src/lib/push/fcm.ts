// =============================================================================
// push/fcm.ts — envio de push via Firebase Cloud Messaging (HTTP v1).
// Usa a CONTA DE SERVIÇO (FIREBASE_SERVICE_ACCOUNT_B64 = base64 do JSON) para
// assinar um JWT → trocar por access token (cacheado) → POST no endpoint v1.
// Envia mensagens DATA-ONLY com prioridade ALTA: o app nativo (FcmService)
// monta a notificação full-screen "estilo chamada" — funciona em 2º plano/
// bloqueado. Sem credencial configurada → no-op silencioso (não quebra nada).
// =============================================================================

import jwt from 'jsonwebtoken'

interface ServiceAccount { client_email: string; private_key: string; project_id: string }

function serviceAccount(): ServiceAccount | null {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64
  if (!b64) return null
  try {
    const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    if (sa?.client_email && sa?.private_key && sa?.project_id) return sa
  } catch (err) {
    console.error('[fcm] conta de serviço inválida:', err)
  }
  return null
}

let cached: { token: string; expiresAt: number } | null = null
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    sa.private_key, { algorithm: 'RS256' },
  )
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const j = await res.json()
  if (!j?.access_token) throw new Error('FCM OAuth falhou: ' + JSON.stringify(j).slice(0, 200))
  cached = { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 }
  return cached.token
}

export interface PushMessage {
  title: string
  body: string
  data?: Record<string, string> // payload extra lido pelo app nativo (type, attendanceId, etc.)
  ttlSeconds?: number
  // true = envia com bloco "notification" (o Android exibe sozinho). Use para
  // avisos comuns (ex.: pendência). O QUEUE_CALL fica DATA-ONLY (app desenha a
  // tela de chamada). Sem isso, um data-only de outro tipo não aparece no app.
  notification?: boolean
}

/**
 * Envia o push para uma lista de tokens FCM. Retorna quantos foram aceitos e
 * os tokens INVÁLIDOS (para o caller desativar no banco). Best-effort.
 */
export async function sendToTokens(tokens: string[], msg: PushMessage): Promise<{ sent: number; invalid: string[] }> {
  const sa = serviceAccount()
  if (!sa || tokens.length === 0) return { sent: 0, invalid: [] }
  let bearer: string
  try { bearer = await accessToken(sa) } catch (err) { console.error('[fcm]', err); return { sent: 0, invalid: [] } }

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  const invalid: string[] = []
  let sent = 0

  await Promise.all([...new Set(tokens)].map(async (token) => {
    const message = {
      message: {
        token,
        // Payload lido pelo app nativo (type, ids, etc.).
        data: { title: msg.title, body: msg.body, ...(msg.data ?? {}) },
        android: {
          priority: 'HIGH',
          ttl: `${msg.ttlSeconds ?? 120}s`,
          // Bloco de notificação → o Android exibe sozinho (avisos comuns).
          ...(msg.notification ? { notification: { channelId: 'default' } } : {}),
        },
        // DATA-ONLY (sem este bloco) = app desenha (tela de chamada da fila).
        ...(msg.notification ? { notification: { title: msg.title, body: msg.body } } : {}),
      },
    }
    try {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(message) })
      if (r.ok) { sent++; return }
      const e = await r.json().catch(() => ({}))
      const code = e?.error?.details?.[0]?.errorCode ?? e?.error?.status
      if (r.status === 404 || code === 'UNREGISTERED' || code === 'NOT_FOUND' || code === 'INVALID_ARGUMENT') invalid.push(token)
      console.warn('[fcm] envio falhou', r.status, code ?? '')
    } catch (err) { console.error('[fcm] envio erro', err) }
  }))

  return { sent, invalid }
}

export function fcmConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT_B64
}

/** Diagnóstico da credencial (sem expor segredos): mostra ONDE a config quebra. */
export async function fcmSelfTest(): Promise<Record<string, unknown>> {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64
  if (!b64) return { hasEnv: false }
  let decoded = ''
  try { decoded = Buffer.from(b64, 'base64').toString('utf8') } catch { /* */ }
  const sa = serviceAccount()
  const out: Record<string, unknown> = {
    hasEnv: true,
    b64Len: b64.length,
    b64TemEspacoOuQuebra: /\s/.test(b64.trim()),
    decodaParaJson: (() => { try { JSON.parse(decoded); return true } catch { return false } })(),
    saValido: !!sa,
    projectId: sa?.project_id ?? null,
    chaveParecePem: !!sa?.private_key && sa.private_key.includes('BEGIN') && sa.private_key.includes('PRIVATE KEY'),
  }
  if (sa) {
    try {
      await accessToken(sa)
      out.oauthOk = true
    } catch (err) {
      out.oauthOk = false
      out.oauthErro = (err instanceof Error ? err.message : String(err)).slice(0, 200)
    }
  }
  return out
}
