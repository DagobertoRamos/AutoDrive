// =============================================================================
// /api/financing/proposals/[id] — ver / editar dados da operação / excluir rascunho.
// A situação (aprovada, recusada, paga…) NÃO muda por aqui: só pelas ações da
// ficha (envio, resposta do banco, formalização, cancelamento).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { updateProposalSchema } from '@/lib/validators/financing'
import { num } from '@/lib/finance/finance-service'
import { tenantRefError } from '@/lib/finance/tenant-refs'
import { addTimeline } from '@/lib/finance/fi/events'
import { fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const p = await prisma.financeProposal.findUniqueOrThrow({ where: { id }, include: { proponent: true, bank: true } })
    return NextResponse.json({ success: true, data: { ...p, portalTokenHash: undefined, amountRequested: num(p.amountRequested), downPayment: num(p.downPayment), approvedValue: num(p.approvedValue), monthlyPayment: num(p.monthlyPayment), vehicleValue: num(p.vehicleValue) } })
  } catch (err) { return fiErrorResponse(err) }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'editarFicha' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const existing = await findScopedProposal(auth, id)
    if (!existing) return notFoundFicha()
    const body = (await req.json()) as Record<string, unknown>
    if ('status' in body) return NextResponse.json({ success: false, error: 'A situação da ficha muda pelas ações da ficha (enviar, registrar resposta, cancelar).' }, { status: 400 })
    const d = updateProposalSchema.parse(body)
    const refErr = await tenantRefError(auth.tenantId, d)
    if (refErr) return NextResponse.json({ success: false, error: refErr }, { status: 400 })
    if (existing.status === 'CANCELADA') return NextResponse.json({ success: false, error: 'Ficha cancelada não pode ser alterada.' }, { status: 409 })
    const termsKeys = ['vehicleValue', 'downPayment', 'amountRequested', 'installments', 'coProponentId', 'proponentId'] as const
    const touchesTerms = termsKeys.some((k) => d[k] !== undefined)
    if (touchesTerms && existing.selectedSubmissionId) return NextResponse.json({ success: false, error: 'A proposta já foi escolhida. Para mudar as condições, desfaça a escolha.' }, { status: 409 })
    const sent = await prisma.financeProposalSubmission.count({ where: { proposalId: id, active: true } })
    if (touchesTerms && sent) return NextResponse.json({ success: false, error: 'A ficha já foi enviada. Use "Ajustar proposta" para mudar as condições — o histórico fica preservado.' }, { status: 409 })
    const { revision, ...fields } = d
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) data[k] = v
    if (d.coProponentId && d.coProponentId === (d.proponentId ?? existing.proponentId)) return NextResponse.json({ success: false, error: 'O co-comprador precisa ser outra pessoa.' }, { status: 400 })
    // Trava otimista: duas abas/dois usuários não sobrescrevem um ao outro.
    const res = await prisma.financeProposal.updateMany({
      where: { id, tenantId: auth.tenantId, ...(revision != null ? { revision } : {}) },
      data: { ...data, revision: { increment: 1 } },
    })
    if (res.count === 0) return NextResponse.json({ success: false, error: 'Esta ficha foi alterada por outra pessoa. Atualize a página.', code: 'REVISAO' }, { status: 409 })
    await addTimeline(prisma, { tenantId: auth.tenantId, proposalId: id, type: 'NOTE', source: 'MANUAL', actorId: auth.user.id, message: 'Dados da operação atualizados.' })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'UPDATE', entity: 'FinanceProposal', entityId: id, userName: auth.user.name, userRole: auth.user.role, afterData: Object.keys(data) })
    return NextResponse.json({ success: true })
  } catch (err) { return fiErrorResponse(err) }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'cancelarProposta' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const existing = await findScopedProposal(auth, id)
    if (!existing) return notFoundFicha()
    const sent = await prisma.financeProposalSubmission.count({ where: { proposalId: id } })
    if (sent || existing.status !== 'SIMULACAO' || existing.dealPaymentId) {
      return NextResponse.json({ success: false, error: 'Só rascunhos nunca enviados podem ser excluídos. Use "Cancelar ficha" — o histórico fica guardado.' }, { status: 409 })
    }
    await prisma.financeProposal.delete({ where: { id } })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'DELETE', entity: 'FinanceProposal', entityId: id, userName: auth.user.name, userRole: auth.user.role })
    return NextResponse.json({ success: true })
  } catch (err) { return fiErrorResponse(err) }
}
