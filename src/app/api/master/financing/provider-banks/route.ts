// =============================================================================
// /api/master/financing/provider-banks — bancos homologados por provedor (Master).
//   GET  : master.financing — lista (opcional ?providerId=) com nome do provedor
//   POST : master.financing — cria banco homologado vinculado a um provedor
// MASTER-only. GLOBAL (sem tenant).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createProviderBankSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const providerId = new URL(req.url).searchParams.get('providerId')
    const rows = await prisma.financeProviderBank.findMany({
      where: providerId ? { providerId } : {},
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { provider: { select: { name: true } } },
    })
    return NextResponse.json({ success: true, data: rows.map((b) => ({ id: b.id, providerId: b.providerId, providerName: b.provider?.name ?? '—', name: b.name, code: b.code, active: b.active })) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const d = createProviderBankSchema.parse(await req.json())
    const provider = await prisma.financeProvider.findUnique({ where: { id: d.providerId }, select: { id: true } })
    if (!provider) return NextResponse.json({ success: false, error: 'Provedor inválido.' }, { status: 400 })
    const b = await prisma.financeProviderBank.create({ data: { providerId: d.providerId, name: d.name, code: d.code ?? null, active: d.active } })
    await createSafeAuditLog({ userId: user.id, action: 'CREATE', entity: 'FinanceProviderBank', entityId: b.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: b.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
