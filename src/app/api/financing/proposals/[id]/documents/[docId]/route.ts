// =============================================================================
// /api/financing/proposals/[id]/documents/[docId] — atualizar/excluir documento.
//   PATCH  : financing.manage — muda status (APROVADO/REPROVADO/PENDENTE)/notes
//   DELETE : financing.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateDocumentSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string; docId: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Documento não encontrado.' }, { status: 404 })

async function guard(docId: string, proposalId: string, userTenantId: string | null | undefined, role: string) {
  const doc = await prisma.financeProposalDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.proposalId !== proposalId) return { error: notFound(), doc: null }
  if (!ownsTenant(role, userTenantId, doc.tenantId)) return { error: forbiddenResponse('Documento de outro tenant.'), doc: null }
  return { error: null, doc }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  const { id, docId } = await params
  try {
    const g = await guard(docId, id, user.tenantId, user.role)
    if (g.error) return g.error
    const d = updateDocumentSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.status !== undefined) data.status = d.status
    if (d.required !== undefined) data.required = d.required
    if (d.notes !== undefined) data.notes = d.notes ?? null
    await prisma.financeProposalDocument.update({ where: { id: docId }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: g.doc.tenantId, action: 'UPDATE', entity: 'FinanceProposalDocument', entityId: docId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  const { id, docId } = await params
  try {
    const g = await guard(docId, id, user.tenantId, user.role)
    if (g.error) return g.error
    await prisma.financeProposalDocument.delete({ where: { id: docId } })
    await createSafeAuditLog({ userId: user.id, tenantId: g.doc.tenantId, action: 'DELETE', entity: 'FinanceProposalDocument', entityId: docId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
