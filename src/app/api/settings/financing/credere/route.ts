// =============================================================================
// /api/settings/financing/credere — conexão da LOJA com a Credere (reserva do F&I).
//   GET    : situação (conectado, conta, loja Credere, lojas disponíveis)
//   PATCH  : troca a loja da Credere usada no envio ({ storeId }) e/ou grava o
//            secret do webhook ({ webhookSecret }; vazio = remove)
//   DELETE : desconecta (apaga o token cifrado)
// financing.config + loja ativa. Nunca devolve token.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { isCryptoConfigured } from '@/lib/finance/crypto'
import { currentFiEnvironment } from '@/lib/finance/fi/gateway/registry'
import { credereAppCredentials, credereRequest } from '@/lib/finance/fi/gateway/credere'
import { credereReady, deleteCredereConnection, findCredereConnection, patchCredereConnection, setCredereWebhookSecret } from '@/lib/finance/fi/gateway/credere-connection'
import { tenantWebhookUrl } from '@/lib/finance/fi/gateway/webhook-keys'
import { listStores } from '@/lib/finance/fi/gateway/credere-oauth'

async function auth(req: Request) {
  const user = await getSessionUser()
  if (!user) return { res: unauthorizedResponse() }
  if (!canAccessModule(user.role, 'financing.config')) return { res: forbiddenResponse('Sem acesso às configurações de F&I.') }
  const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return { res: gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { res: forbiddenResponse(actingTenantError(user)) }
  return { user, tenantId }
}

export async function GET(req: Request) {
  const a = await auth(req); if ('res' in a) return a.res
  const environment = currentFiEnvironment()
  const conn = await findCredereConnection(a.tenantId, environment)
  const stores = conn?.readable && conn.credentials.accessToken ? await listStores(conn.credentials.accessToken).catch(() => []) : []
  return NextResponse.json({
    success: true,
    data: {
      appConfigured: !!credereAppCredentials(), cryptoReady: isCryptoConfigured(), environment,
      connected: !!conn, ready: credereReady(conn), readable: conn?.readable ?? null,
      userName: conn?.credentials.userName ?? null, storeId: conn?.credentials.storeId ?? null, storeName: conn?.credentials.storeName ?? null,
      sellerOk: !!(conn?.credentials.sellerCpf && conn?.credentials.sellerId),
      connectedAt: conn?.credentials.connectedAt ?? null,
      // URL que a loja cadastra no formulário da loja na Credere (avisos assinados).
      webhookUrl: tenantWebhookUrl(process.env.NEXTAUTH_URL || new URL(req.url).origin, 'credere', a.tenantId),
      webhookSigned: !!conn?.credentials.webhookSecret,
      stores: stores.map((s) => ({ id: String(s.id), name: s.name, city: s.city, uf: s.uf })),
    },
  })
}

export async function PATCH(req: Request) {
  const a = await auth(req); if ('res' in a) return a.res
  const body = await req.json().catch(() => ({})) as { storeId?: string; webhookSecret?: string | null }
  const conn = await findCredereConnection(a.tenantId, currentFiEnvironment())
  if (!conn?.readable) return NextResponse.json({ success: false, error: 'Conecte a Credere primeiro.' }, { status: 409 })
  if ('webhookSecret' in body) {
    const secret = typeof body.webhookSecret === 'string' ? body.webhookSecret.trim() : ''
    if (secret && (secret.length < 8 || secret.length > 300 || /\s/.test(secret))) return NextResponse.json({ success: false, error: 'Secret inválido: copie exatamente o valor mostrado pela Credere abaixo da URL.' }, { status: 400 })
    await setCredereWebhookSecret(conn.credentialId, secret || null)
    await createSafeAuditLog({ userId: a.user.id, tenantId: a.tenantId, action: secret ? 'CREDERE_WEBHOOK_SECRET' : 'CREDERE_WEBHOOK_SECRET_REMOVIDO', entity: 'CredereConnection', entityId: conn.credentialId, userName: a.user.name, userRole: a.user.role })
    if (!body.storeId) return NextResponse.json({ success: true })
  }
  const stores = await listStores(conn.credentials.accessToken)
  const store = stores.find((s) => String(s.id) === String(body.storeId ?? ''))
  if (!store) return NextResponse.json({ success: false, error: 'Loja da Credere inválida.' }, { status: 400 })
  await patchCredereConnection(conn.credentialId, { storeId: String(store.id), storeName: store.name, storeUf: store.uf, storeCity: store.city })
  await createSafeAuditLog({ userId: a.user.id, tenantId: a.tenantId, action: 'UPDATE', entity: 'CredereConnection', entityId: conn.credentialId, userName: a.user.name, userRole: a.user.role })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const a = await auth(req); if ('res' in a) return a.res
  const environment = currentFiEnvironment()
  const conn = await findCredereConnection(a.tenantId, environment)
  if (conn?.readable && conn.credentials.accessToken) {
    // Revoga na Credere (melhor esforço) antes de apagar aqui.
    await credereRequest({ tenantId: a.tenantId, environment, credentials: conn.credentials, correlationId: 'desconectar' }, { method: 'POST', path: '/v1/revoke', body: { token: conn.credentials.accessToken }, idempotent: true }).catch(() => null)
  }
  const removed = await deleteCredereConnection(a.tenantId, environment)
  if (removed) await createSafeAuditLog({ userId: a.user.id, tenantId: a.tenantId, action: 'DELETE', entity: 'CredereConnection', entityId: conn?.credentialId ?? '', userName: a.user.name, userRole: a.user.role })
  return NextResponse.json({ success: true })
}
