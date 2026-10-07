// GET /api/financing/connections — área "Bancos": estado da conexão de cada banco
// da loja ativa. Nunca devolve credencial; só o que a loja precisa ver.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isFiAllowed } from '@/lib/finance/fi-permissions'
import { resolveBank } from '@/lib/finance/fi/gateway/resolve'
import { CONNECTION_META, currentFiEnvironment, getBankProvider, listBankProviders } from '@/lib/finance/fi/gateway/registry'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'

export async function GET(req: Request) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  try {
    const canConfig = await isFiAllowed(auth.tenantId, 'configurarBancos', auth.user.role)
    const [tenant, banks] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { name: true } }),
      prisma.financeBank.findMany({ where: { tenantId: auth.tenantId }, orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { id: true, name: true, code: true, active: true, adapterKey: true } }),
    ])
    const keys = [...new Set(banks.map((b) => b.adapterKey).filter(Boolean))] as string[]
    const lastLogs = keys.length ? await prisma.financeIntegrationLog.findMany({
      where: { tenantId: auth.tenantId, adapterKey: { in: keys } }, orderBy: { createdAt: 'desc' }, take: 200, select: { adapterKey: true, createdAt: true, status: true },
    }) : []
    const data = await Promise.all(banks.map(async (b) => {
      const r = await resolveBank(auth.tenantId, b)
      const provider = getBankProvider(b.adapterKey)
      const last = lastLogs.find((l) => l.adapterKey === b.adapterKey)
      const lastAt = [last?.createdAt, r.lastTestAt].filter(Boolean).sort((x, y) => (y as Date).getTime() - (x as Date).getTime())[0] as Date | undefined
      return {
        id: b.id, name: b.name, code: b.code, active: b.active, adapterKey: b.adapterKey,
        channel: provider ? { name: provider.name, kind: provider.channel } : null,
        state: r.state, label: CONNECTION_META[r.state].label, tone: CONNECTION_META[r.state].tone, hint: CONNECTION_META[r.state].hint,
        hasCredential: canConfig ? !!r.credentialId : undefined,
        lastCommunicationAt: lastAt?.toISOString() ?? null,
        lastTestStatus: canConfig ? r.lastTestStatus : undefined,
      }
    }))
    return NextResponse.json({
      success: true,
      data, store: tenant?.name ?? null, environment: currentFiEnvironment(), canConfig,
      providers: canConfig ? listBankProviders() : undefined,
    })
  } catch (err) { return fiErrorResponse(err) }
}
