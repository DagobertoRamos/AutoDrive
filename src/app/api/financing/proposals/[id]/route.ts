// =============================================================================
// /api/financing/proposals/[id] — ver / editar (status, aprovar/recusar) / excluir.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateProposalSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant, num } from '@/lib/finance/finance-service'
import { isFiAllowed } from '@/lib/finance/fi-permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Ficha não encontrada.' }, { status: 404 })

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const { id } = await params
  try {
    const p = await prisma.financeProposal.findUnique({ where: { id }, include: { proponent: true, bank: true } })
    if (!p) return notFound()
    if (!ownsTenant(user.role, user.tenantId, p.tenantId)) return forbiddenResponse('Ficha de outro tenant.')
    return NextResponse.json({ success: true, data: { ...p, amountRequested: num(p.amountRequested), downPayment: num(p.downPayment), approvedValue: num(p.approvedValue), monthlyPayment: num(p.monthlyPayment) } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const { id } = await params

  try {
    const existing = await prisma.financeProposal.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Ficha de outro tenant.')

    const d = updateProposalSchema.parse(await req.json())
    // Permissões F&I: aprovar/recusar a ficha é restrito a quem a loja autoriza.
    if ((d.status === 'APROVADA' || d.status === 'RECUSADA') && !(await isFiAllowed(existing.tenantId, 'aprovar', user.role))) {
      return forbiddenResponse('Seu perfil não pode aprovar/recusar fichas (Permissões F&I da loja).')
    }
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) if (v !== undefined) updateData[k] = v

    const proposal = await prisma.financeProposal.update({ where: { id }, data: updateData as never })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: d.status ? `STATUS_${d.status}` : 'UPDATE', entity: 'FinanceProposal', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: proposal })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const { id } = await params
  try {
    const existing = await prisma.financeProposal.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Ficha de outro tenant.')
    await prisma.financeProposal.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinanceProposal', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
