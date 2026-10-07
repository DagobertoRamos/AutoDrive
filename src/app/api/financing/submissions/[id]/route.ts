// =============================================================================
// /api/financing/submissions/[id] — resposta do banco para UMA proposta (tentativa).
//   POST { action: 'RESPOSTA', status, offer?, reason?, pendingItems? }
//        registro manual (banco ainda não integrado / confirmação do portal).
//   POST { action: 'VERIFICAR' } consulta o banco (quando a integração permite)
//        antes de liberar novo envio de uma proposta sem resposta.
// Transições validadas pela máquina de estados; repetir a mesma resposta não
// duplica nada. Aprovar/recusar exige a permissão "Registrar resposta do banco".
// =============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordManualResponse, verifyAttempt, FiError } from '@/lib/finance/fi/orchestrator'
import { ATTEMPT_STATUS } from '@/lib/finance/fi/status-core'
import { isFiAllowed } from '@/lib/finance/fi-permissions'
import { fiAuth, fiErrorResponse, findScopedProposal } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }
const money = z.number().min(0).max(100_000_000).nullable().optional()
const pct = z.number().min(0).max(100).nullable().optional()
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('VERIFICAR') }),
  z.object({
    action: z.literal('RESPOSTA'),
    status: z.enum(ATTEMPT_STATUS),
    reason: z.string().max(500).nullable().optional(),
    externalId: z.string().max(100).nullable().optional(),
    offer: z.object({
      approvedAmount: money, downPayment: money, installments: z.number().int().min(1).max(120).nullable().optional(),
      installmentValue: money, rateMonthly: pct, cetMonthly: pct, cetYearly: z.number().min(0).max(1000).nullable().optional(),
      totalAmount: money, tacValue: money, expiresAt: z.string().max(30).nullable().optional(),
    }).nullable().optional(),
    returnPercent: pct,
    pendingItems: z.array(z.object({ key: z.string().max(60), label: z.string().min(1).max(120), kind: z.enum(['DOCUMENTO', 'CAMPO', 'OUTRO']) })).max(20).optional(),
  }),
])

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const sub = await prisma.financeProposalSubmission.findFirst({ where: { id, tenantId: auth.tenantId }, select: { id: true, proposalId: true } })
    if (!sub || !(await findScopedProposal(auth, sub.proposalId))) return NextResponse.json({ success: false, error: 'Proposta não encontrada.' }, { status: 404 })
    const d = schema.parse(await req.json())
    if (d.action === 'VERIFICAR') {
      const status = await verifyAttempt(id, auth.actor)
      return NextResponse.json({ success: true, data: { status } })
    }
    if (['APROVADA', 'RECUSADA', 'PRE_APROVADA', 'PENDENTE'].includes(d.status) && !(await isFiAllowed(auth.tenantId, 'aprovar', auth.user.role))) {
      throw new FiError('Seu perfil não pode registrar a resposta do banco.', 403)
    }
    if (d.returnPercent != null) {
      if (!(await isFiAllowed(auth.tenantId, 'verRetorno', auth.user.role))) throw new FiError('Seu perfil não pode informar o retorno.', 403)
      await prisma.financeProposalSubmission.update({ where: { id }, data: { returnPercent: d.returnPercent } })
    }
    const r = await recordManualResponse(id, { status: d.status, reason: d.reason, externalId: d.externalId, offer: d.offer ?? undefined, pendingItems: d.pendingItems }, auth.actor)
    return NextResponse.json({ success: true, data: r })
  } catch (err) { return fiErrorResponse(err) }
}
