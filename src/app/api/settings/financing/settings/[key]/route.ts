// =============================================================================
// /api/settings/financing/settings/[key] — configs genéricas do F&I da loja.
//   GET : financing.config — retorna a config (ou o default da chave)
//   PUT : financing.config — valida (por chave) e salva (upsert), auditado
// Chaves: 'required_documents' | 'permissions'. Tenant-scoped; MASTER bloqueado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { FI_SETTING_KEYS, isFiSettingKey } from '@/lib/finance/settings'

type Ctx = { params: Promise<{ key: string }> }
const badKey = () => NextResponse.json({ success: false, error: 'Configuração desconhecida.' }, { status: 404 })

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem acesso às configurações de F&I.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const { key } = await params
  if (!isFiSettingKey(key)) return badKey()

  try {
    const tenantId = tid
    const row = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key } } })
    const spec = FI_SETTING_KEYS[key]
    // Aplica o schema sobre o valor salvo (preenche defaults de campos novos).
    const parsed = spec.schema.safeParse(row?.value ?? spec.default)
    return NextResponse.json({ success: true, data: parsed.success ? parsed.data : spec.default })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão para alterar configurações de F&I.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const { key } = await params
  if (!isFiSettingKey(key)) return badKey()

  try {
    const tenantId = tid
    const spec = FI_SETTING_KEYS[key]
    const value = spec.schema.parse(await req.json())
    await prisma.financeTenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { value, updatedById: user.id },
      create: { tenantId, key, value, updatedById: user.id },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinanceTenantSetting', entityId: key, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: value })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
