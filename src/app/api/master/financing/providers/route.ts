// =============================================================================
// /api/master/financing/providers — provedores de F&I (GLOBAL, Master).
//   GET  : master.financing — lista provedores (+ contagem de bancos)
//   POST : master.financing — cria provedor
// MASTER-only. Provedores são da plataforma; credenciais são da loja (nunca aqui).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createProviderSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const rows = await prisma.financeProvider.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { providerBanks: true } } },
    })
    return NextResponse.json({ success: true, data: rows.map((p) => ({ ...p, banksCount: p._count.providerBanks })) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const d = createProviderSchema.parse(await req.json())
    const p = await prisma.financeProvider.create({ data: d })
    await createSafeAuditLog({ userId: user.id, action: 'CREATE', entity: 'FinanceProvider', entityId: p.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: p.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
