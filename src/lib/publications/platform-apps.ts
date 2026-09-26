// =============================================================================
// Apps DA PLATAFORMA para os canais com OAuth (Mercado Livre, OLX, Meta).
// São do AutoDrive (não da loja): cada loja autoriza a PRÓPRIA conta com eles.
// Fonte: Master › Integrações (IntegrationCredential PUB_*, segredo cifrado)
// e, como alternativa, variáveis de ambiente (ML_CLIENT_ID etc.).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/crypto'
import { createHttpClient, type HttpClient } from './connectors/http'

export type PlatformChannel = 'MERCADO_LIVRE' | 'OLX' | 'META' | 'MOBIAUTO'
export interface PlatformApp { clientId: string; clientSecret: string; source: 'master' | 'env' }

const SERVICE: Record<PlatformChannel, string> = { MERCADO_LIVRE: 'PUB_MERCADO_LIVRE', OLX: 'PUB_OLX', META: 'PUB_META', MOBIAUTO: 'PUB_MOBIAUTO' }
const ENV: Record<PlatformChannel, [string, string]> = { MERCADO_LIVRE: ['ML_CLIENT_ID', 'ML_CLIENT_SECRET'], OLX: ['OLX_CLIENT_ID', 'OLX_CLIENT_SECRET'], META: ['META_APP_ID', 'META_APP_SECRET'], MOBIAUTO: ['MOBIAUTO_CLIENT_ID', 'MOBIAUTO_CLIENT_SECRET'] }

/** Segredos dos apps de publicação são gravados cifrados. */
export function sealIfPublication(service: string, value: string | null): string | null {
  if (!value || !service.startsWith('PUB_')) return value
  return encrypt(value)
}

const cache = new Map<PlatformChannel, { v: PlatformApp | null; exp: number }>()
export function clearPlatformAppCache() { cache.clear() }

export async function getPlatformApp(channel: PlatformChannel): Promise<PlatformApp | null> {
  const hit = cache.get(channel)
  if (hit && hit.exp > Date.now()) return hit.v
  let v: PlatformApp | null = null
  try {
    const row = await prisma.integrationCredential.findFirst({ where: { service: SERVICE[channel], active: true }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] })
    const secret = row?.apiSecret ? decrypt(row.apiSecret) : ''
    if (row?.apiKey && secret) v = { clientId: row.apiKey.trim(), clientSecret: secret.trim(), source: 'master' }
  } catch { /* banco indisponível: tenta env */ }
  if (!v) {
    const [idK, secK] = ENV[channel]
    const id = process.env[idK]; const sec = process.env[secK]
    if (id && sec) v = { clientId: id, clientSecret: sec, source: 'env' }
  }
  cache.set(channel, { v, exp: Date.now() + 60_000 })
  return v
}

/** Confere o app pelo meio oficial disponível (sem precisar de login de loja). */
export async function testPlatformApp(service: string, apiKey: string | null, sealedSecret: string | null, http: HttpClient = createHttpClient()): Promise<{ ok: boolean; message: string }> {
  const id = apiKey?.trim(); const secret = sealedSecret ? decrypt(sealedSecret).trim() : ''
  if (!id || !secret) return { ok: false, message: 'Informe o ID e o segredo do app.' }
  if (service === 'PUB_META') {
    // Token de aplicativo (client_credentials) — documentado pela Meta.
    const res = await http.request({ url: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' })}` })
    const j = res.json<{ access_token?: string; error?: { message?: string } }>()
    return res.status === 200 && j?.access_token ? { ok: true, message: 'App Meta válido (ID e segredo aceitos). Falta a aprovação das permissões no App Review para lojas de terceiros.' } : { ok: false, message: `Meta recusou: ${j?.error?.message ?? `HTTP ${res.status}`}` }
  }
  if (service === 'PUB_MERCADO_LIVRE') {
    const res = await http.request({ method: 'POST', url: 'https://api.mercadolibre.com/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }) })
    const j = res.json<{ access_token?: string; error?: string; message?: string }>()
    if (res.status === 200 && j?.access_token) return { ok: true, message: 'App do Mercado Livre válido (ID e segredo aceitos).' }
    if (j?.error === 'invalid_client') return { ok: false, message: 'Mercado Livre recusou o ID ou o segredo do app (invalid_client).' }
    return { ok: false, message: `Não foi possível confirmar pelo Mercado Livre (${j?.error ?? res.status}: ${j?.message ?? ''}). A validação final acontece no primeiro login de uma loja.` }
  }
  if (service === 'PUB_MOBIAUTO') {
    const res = await http.request({ method: 'POST', url: 'https://auth.mobiauto.com.br/auth/realms/mobiauto/protocol/openid-connect/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }) })
    const j = res.json<{ access_token?: string; error?: string; error_description?: string }>()
    if (res.status === 200 && j?.access_token) return { ok: true, message: 'App da Mobiauto válido (ID e segredo aceitos).' }
    if (j?.error === 'invalid_client') return { ok: false, message: `Mobiauto recusou o app (invalid_client: ${j.error_description ?? ''}).` }
    return { ok: false, message: `Não foi possível confirmar pela Mobiauto (${j?.error ?? res.status}: ${j?.error_description ?? ''}). A validação final acontece no primeiro login de uma loja.` }
  }
  if (service === 'PUB_OLX') {
    return { ok: true, message: 'Dados salvos. A OLX não oferece teste do app sem login: a validação acontece quando a primeira loja clicar em Conectar.' }
  }
  return { ok: false, message: 'Serviço desconhecido.' }
}
