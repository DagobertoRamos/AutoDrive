// =============================================================================
// /api/financing/submissions/[id] — atualizar status de uma submissão (F&I).
//   POST : financing.manage — registra novo status + evento (linha do tempo).
// Atualização MANUAL e supervisionada. APROVADA reflete na ficha.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { submissionEventSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  const { id } = await params
  try {
    const submission = await prisma.financeProposalSubmission.findUnique({ where: { id } })
    if (!submission) return NextResponse.json({ success: false, error: 'Submissão não encontrada.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, submission.tenantId)) return forbiddenResponse('Submissão de outro tenant.')

    const d = submissionEventSchema.parse(await req.json())
    await prisma.financeProposalSubmission.update({ where: { id }, data: { status: d.status } })
    await prisma.financeProposalEvent.create({
      data: { tenantId: submission.tenantId, proposalId: submission.proposalId, submissionId: id, type: 'STATUS_CHANGE', status: d.status, message: d.message ?? null, source: 'MANUAL', createdById: user.id },
    })
    // Aprovação de um banco reflete na ficha.
    if (d.status === 'APROVADA' && submission.proposalId) {
      await prisma.financeProposal.update({ where: { id: submission.proposalId }, data: { status: 'APROVADA' } }).catch(() => {})
    }
    await createSafeAuditLog({ userId: user.id, tenantId: submission.tenantId, action: `SUBMISSION_${d.status}`, entity: 'FinanceProposalSubmission', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
