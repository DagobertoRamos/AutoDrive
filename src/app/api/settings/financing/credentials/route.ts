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
import { EXTRA_CREDENTIAL_KEYS, credentialSpecFor } from '@/lib/finance/fi/gateway/credential-specs'
import { tenantWebhookKey, tenantWebhookUrl } from '@/lib/finance/fi/gateway/webhook-keys'

// Monta os hints de exibição: usuário/clientId/storeCode visíveis; segredos mascarados.
function buildHints(d: Record<string, string | null | undefined>, expiresAt?: string | null) {
  const h: Record<string, string> = {}
  if (expiresAt) h.expiresAt = expiresAt
  if (d.usuario) h.usuario = d.usuario
  if (d.clientId) h.clientId = d.clientId
  if (d.storeCode) h.storeCode = d.storeCode
  if (d.senha) h.senha = maskSecret(d.senha)
  if (d.token) h.token = maskSecret(d.token)
  if (d.clientSecret) h.clientSecret = maskSecret(d.clientSecret)
  for (const k of EXTRA_CREDENTIAL_KEYS) {
    const v = d[k]
    if (!v) continue
    h[k] = k === 'certPfx' ? 'arquivo enviado' : /senha|secret/i.test(k) ? maskSecret(v) : v.slice(0, 60)
  }
  return h
}

/** Só as chaves conhecidas dos conectores; vazio = não mexe. */
function pickExtra(extra: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(extra ?? {})) if (EXTRA_CREDENTIAL_KEYS.has(k) && typeof v === 'string' && v.trim()) out[k] = v.trim()
  return out
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
    const banks = bankIds.length ? await prisma.financeBank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true, adapterKey: true } }) : []
    const bankMap = Object.fromEntries(banks.map((b) => [b.id, b.name]))
    // URL + chave de webhook DA LOJA para os bancos que avisam por webhook (a loja cadastra no banco).
    const platformSecret = process.env.FINANCE_WEBHOOK_SECRET?.trim()
    const origin = (process.env.NEXTAUTH_URL || new URL(req.url).origin).replace(/\/+$/, '')
    const webhookFor = (bankId: string | null) => {
      const key = banks.find((b) => b.id === bankId)?.adapterKey
      if (!key || !credentialSpecFor(key)?.webhook) return null
      if (!platformSecret || platformSecret.length < 16) return { url: null, key: null, missing: 'Receptor de webhooks desligado: defina FINANCE_WEBHOOK_SECRET no ambiente.' }
      return { url: tenantWebhookUrl(origin, key, tenantId), key: tenantWebhookKey(platformSecret, tenantId, key), missing: null }
    }
    return NextResponse.json({
      success: true,
      cryptoReady: isCryptoConfigured(),
      data: rows.map((r) => ({ ...r, bankName: r.bankId ? (bankMap[r.bankId] ?? '—') : '—', webhook: webhookFor(r.bankId) })),
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
    // Banco precisa ser DESTA loja; uma credencial por banco e ambiente.
    const bank = await prisma.financeBank.findFirst({ where: { id: d.bankId, tenantId }, select: { id: true } })
    if (!bank) return NextResponse.json({ success: false, error: 'Banco inválido para esta loja.' }, { status: 400 })
    const dup = await prisma.financeCredential.findFirst({ where: { tenantId, bankId: d.bankId, environment: d.environment }, select: { id: true } })
    if (dup) return NextResponse.json({ success: false, error: 'Já existe credencial deste banco neste ambiente. Edite a existente.' }, { status: 409 })
    const secrets: Record<string, string> = { usuario: d.usuario ?? '', senha: d.senha ?? '', token: d.token ?? '', clientId: d.clientId ?? '', clientSecret: d.clientSecret ?? '', storeCode: d.storeCode ?? '', ...pickExtra(d.extra) }
    const cred = await prisma.financeCredential.create({
      data: {
        tenantId, bankId: d.bankId, environment: d.environment, label: d.label ?? null,
        secretsEncrypted: encryptSecrets(secrets), maskedHints: buildHints(secrets, d.expiresAt) as never,
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
