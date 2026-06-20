// =============================================================================
// /api/settings/financing/credentials/[id]/test — testar credencial (F&I).
// Sem adapter real ainda (Fase 5): valida que a chave de cripto lê os segredos
// (integridade) e registra log técnico + auditoria SEM expor segredo.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'
import { decryptSecrets, isCryptoConfigured } from '@/lib/finance/crypto'
import { assertModuleEnabled } from '@/lib/tenant-modules'

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
    const cred = await prisma.financeCredential.findUnique({ where: { id } })
    if (!cred) return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    if (!ownsTenant(user.role, tid, cred.tenantId)) return forbiddenResponse('Credencial de outro tenant.')
    if (!isCryptoConfigured()) return NextResponse.json({ success: false, error: 'Criptografia não configurada (FINANCE_ENCRYPTION_KEY).' }, { status: 503 })

    // Verifica integridade/legibilidade dos segredos (sem expor valores).
    const secrets = decryptSecrets(cred.secretsEncrypted)
    const hasAny = Object.values(secrets).some((v) => v && String(v).trim())
    const status = hasAny ? 'OK' : 'VAZIO'

    // Log técnico (sem segredo) + auditoria.
    await prisma.financeIntegrationLog.create({
      data: { tenantId: cred.tenantId, action: 'TEST_CONNECTION', status, message: hasAny ? 'Credencial legível.' : 'Credencial sem segredos preenchidos.' },
    }).catch(() => {})
    await createSafeAuditLog({ userId: user.id, tenantId: cred.tenantId, action: 'TEST_CONNECTION', entity: 'FinanceCredential', entityId: id, userName: user.name, userRole: user.role })

    return NextResponse.json({
      success: hasAny,
      status,
      message: hasAny
        ? 'Credencial legível e íntegra. O teste de conexão REAL com o banco será habilitado com os adaptadores (Fase 5).'
        : 'A credencial não possui segredos preenchidos.',
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
