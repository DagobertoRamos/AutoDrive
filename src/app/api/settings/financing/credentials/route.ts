// =============================================================================
// /api/settings/financing/credentials — credenciais de banco da loja (F&I).
//   GET  : financing.config — lista MASCARADA (nunca retorna segredo)
//   POST : financing.config — cifra os segredos e salva (auditado)
// Segredos cifrados com FINANCE_ENCRYPTION_KEY; só maskedHints vão ao front.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createCredentialSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { encryptSecrets, maskSecret, isCryptoConfigured } from '@/lib/finance/crypto'
import { assertModuleEnabled } from '@/lib/tenant-modules'

// Monta os hints de exibição: usuário/clientId/storeCode visíveis; segredos mascarados.
function buildHints(d: Record<string, string | null | undefined>) {
  const h: Record<string, string> = {}
  if (d.usuario) h.usuario = d.usuario
  if (d.clientId) h.clientId = d.clientId
  if (d.storeCode) h.storeCode = d.storeCode
  if (d.senha) h.senha = maskSecret(d.senha)
  if (d.token) h.token = maskSecret(d.token)
  if (d.clientSecret) h.clientSecret = maskSecret(d.clientSecret)
  return h
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem acesso às configurações de F&I.')
  { const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return gate }
  // MASTER não vê/gerencia credenciais da loja (segredos pertencem ao tenant).
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))

  try {
    const tenantId = tid
    const rows = await prisma.financeCredential.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, bankId: true, environment: true, label: true, maskedHints: true, updatedAt: true },
    })
    const bankIds = [...new Set(rows.map((r) => r.bankId).filter(Boolean))] as string[]
    const banks = bankIds.length ? await prisma.financeBank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } }) : []
    const bankMap = Object.fromEntries(banks.map((b) => [b.id, b.name]))
    return NextResponse.json({
      success: true,
      cryptoReady: isCryptoConfigured(),
      data: rows.map((r) => ({ ...r, bankName: r.bankId ? (bankMap[r.bankId] ?? '—') : '—' })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão para configurar credenciais.')
  { const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  if (!isCryptoConfigured()) return NextResponse.json({ success: false, error: 'Criptografia não configurada (FINANCE_ENCRYPTION_KEY). Defina a chave no ambiente antes de salvar credenciais.' }, { status: 503 })

  try {
    const tenantId = tid
    const d = createCredentialSchema.parse(await req.json())
    const secrets = { usuario: d.usuario ?? '', senha: d.senha ?? '', token: d.token ?? '', clientId: d.clientId ?? '', clientSecret: d.clientSecret ?? '', storeCode: d.storeCode ?? '' }
    const cred = await prisma.financeCredential.create({
      data: {
        tenantId, bankId: d.bankId, environment: d.environment, label: d.label ?? null,
        secretsEncrypted: encryptSecrets(secrets), maskedHints: buildHints(secrets) as never,
        createdById: user.id, updatedById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinanceCredential', entityId: cred.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: cred.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
