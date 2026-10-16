// GET /api/settings/financing/credere/callback — volta do login da Credere.
// Confere o state (loja + usuário + validade), troca o código pelo token da
// LOJA, escolhe a loja da Credere (pelo CNPJ) e guarda tudo cifrado.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, createSafeAuditLog } from '@/lib/auth-guards'
import { isCryptoConfigured } from '@/lib/finance/crypto'
import { currentFiEnvironment } from '@/lib/finance/fi/gateway/registry'
import { saveCredereConnection } from '@/lib/finance/fi/gateway/credere-connection'
import { exchangeCode, listStores, pickStore, verifyState } from '@/lib/finance/fi/gateway/credere-oauth'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = (process.env.NEXTAUTH_URL || url.origin).replace(/\/+$/, '')
  const back = (status: string) => NextResponse.redirect(`${origin}/configuracoes/fi/integracoes?credere=${status}`)
  const user = await getSessionUser()
  const state = verifyState(url.searchParams.get('state'))
  if (!user || !state || state.userId !== user.id) return back('sessao')
  const code = url.searchParams.get('code')
  if (!code) return back('cancelado')
  if (!isCryptoConfigured()) return back('cripto')
  try {
    const tok = await exchangeCode(origin, code)
    const [stores, tenant] = await Promise.all([listStores(tok.accessToken), prisma.tenant.findUnique({ where: { id: state.tenantId }, select: { cnpj: true } })])
    const store = pickStore(stores, tenant?.cnpj)
    await saveCredereConnection(state.tenantId, currentFiEnvironment(), {
      accessToken: tok.accessToken, refreshToken: tok.refreshToken, expiresAt: tok.expiresAt,
      userName: tok.user.name, sellerCpf: tok.user.cpf, sellerId: tok.user.id != null ? String(tok.user.id) : '',
      storeId: store ? String(store.id) : '', storeName: store?.name ?? '', storeUf: store?.uf ?? '', storeCity: store?.city ?? '',
      connectedAt: new Date().toISOString(),
    }, user.id)
    await createSafeAuditLog({ userId: user.id, tenantId: state.tenantId, action: 'CREATE', entity: 'CredereConnection', entityId: state.tenantId, userName: user.name, userRole: user.role })
    return back(store ? 'ok' : 'sem-loja')
  } catch (e) {
    console.error('[credere/callback]', e instanceof Error ? e.message : e)
    return back('erro')
  }
}
