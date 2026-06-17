// =============================================================================
// /api/master/financing/provider-banks/[id] — editar/excluir banco homologado.
//   PATCH / DELETE : master.financing. MASTER-only.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateProviderBankSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Banco não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.financeProviderBank.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return notFound()
    const d = updateProviderBankSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.name !== undefined) data.name = d.name
    if (d.code !== undefined) data.code = d.code ?? null
    if (d.active !== undefined) data.active = d.active
    await prisma.financeProviderBank.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, action: 'UPDATE', entity: 'FinanceProviderBank', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.financeProviderBank.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return notFound()
    await prisma.financeProviderBank.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, action: 'DELETE', entity: 'FinanceProviderBank', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
