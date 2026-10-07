// =============================================================================
// /api/settings/financing/credentials/[id]/test — testar a credencial com o
// banco. Usa o mesmo teste real de F&I › Bancos: sem integração oficial, a
// resposta diz "Banco ainda não integrado" (nada de "OK" simulado).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { decryptSecretsStrict, isCryptoConfigured, SecretsDecryptError } from '@/lib/finance/crypto'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { testBankConnection } from '@/lib/finance/fi/gateway/test-connection'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const { id } = await params

  try {
    const cred = await prisma.financeCredential.findFirst({ where: { id, tenantId: tid } })
    if (!cred) return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    if (!isCryptoConfigured()) return NextResponse.json({ success: false, error: 'Criptografia não configurada no servidor.' }, { status: 503 })
    try { decryptSecretsStrict(cred.secretsEncrypted) } catch (e) {
      if (e instanceof SecretsDecryptError) return NextResponse.json({ success: false, status: 'ERRO', message: e.message })
      throw e
    }
    const bank = cred.bankId ? await prisma.financeBank.findFirst({ where: { id: cred.bankId, tenantId: tid }, select: { id: true, name: true, adapterKey: true } }) : null
    if (!bank) return NextResponse.json({ success: false, status: 'ERRO', message: 'O banco desta credencial não existe mais na loja.' })
    const r = await testBankConnection(tid, bank)
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'TEST_CONNECTION', entity: 'FinanceCredential', entityId: id, userName: user.name, userRole: user.role, afterData: { ok: r.ok } })
    return NextResponse.json({ success: r.ok, status: r.ok ? 'OK' : r.state, message: r.message })
  } catch (err) {
    return handlePrismaError(err)
  }
}
