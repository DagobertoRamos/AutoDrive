// =============================================================================
// /api/marketing/telephony/connections/[id]/test — testar conexão de telefonia.
// POST : marketing.telephony.manage.
//
// NÃO chama provedor externo real (Asterisk/3CX/Twilio/genérico) — os adapters
// reais entram na Fase 4 (só com docs/credenciais oficiais). Aqui validamos a
// configuração (provedor, credenciais cifradas, chave de cripto) e registramos
// o resultado em TelephonyIntegrationLog + lastTestAt/lastTestStatus.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'
import { isTelephonyCryptoConfigured } from '@/lib/telephony/crypto'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.manage')) return forbiddenResponse('Sem permissão.')
  const { id } = await params
  try {
    const conn = await prisma.telephonyTenantConnection.findUnique({
      where: { id },
      include: { provider: { select: { kind: true, name: true } }, credentials: { select: { id: true }, take: 1 } },
    })
    if (!conn) return NextResponse.json({ success: false, error: 'Conexão não encontrada.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, conn.tenantId)) return forbiddenResponse('Conexão de outro tenant.')

    const hasCreds = conn.credentials.length > 0
    let ok = false
    let message: string

    if (conn.provider.kind === 'MANUAL') {
      ok = true
      message = 'Provedor manual: chamadas são registradas manualmente, sem integração externa.'
    } else if (!isTelephonyCryptoConfigured()) {
      message = 'TELEPHONY_ENCRYPTION_KEY não configurada no servidor.'
    } else if (!hasCreds) {
      message = 'Cadastre as credenciais da conexão antes de testar.'
    } else {
      // Config válida, mas o adapter real ainda não existe (Fase 4).
      message = `Configuração válida. A integração real com ${conn.provider.name} estará disponível na próxima fase (adapters).`
      ok = true
    }

    const status = ok ? 'OK' : 'ERROR'
    await prisma.$transaction([
      prisma.telephonyTenantConnection.update({ where: { id }, data: { lastTestAt: new Date(), lastTestStatus: status } }),
      prisma.telephonyIntegrationLog.create({ data: { tenantId: conn.tenantId, connectionId: id, providerKind: conn.provider.kind, action: 'TEST', status, message, createdByUserId: user.id } }),
    ])
    await createSafeAuditLog({ userId: user.id, tenantId: conn.tenantId, action: 'TEST', entity: 'TelephonyTenantConnection', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, test: { ok, message } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
