// =============================================================================
// /api/financing/proposals — fichas/propostas de financiamento. Multi-tenant.
//   GET  : financing (read; filtros ?status=&proponentId=&bankId=&q=)
//   POST : financing.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createProposalSchema } from '@/lib/validators/financing'
import { zodErrorResponse, num } from '@/lib/finance/finance-service'

const STATUSES = ['SIMULACAO', 'ENVIADA', 'APROVADA', 'RECUSADA', 'CANCELADA']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const extra: Record<string, unknown> = {}
    const status = searchParams.get('status')
    const proponentId = searchParams.get('proponentId')
    const bankId = searchParams.get('bankId')
    const q = searchParams.get('q')?.trim()
    if (status && STATUSES.includes(status)) extra.status = status
    if (proponentId) extra.proponentId = proponentId
    if (bankId) extra.bankId = bankId
    if (q) extra.OR = [
      { vehicle: { contains: q, mode: 'insensitive' } },
      { proponent: { is: { nomeCompleto: { contains: q, mode: 'insensitive' } } } },
      { proponent: { is: { cpf: { contains: q.replace(/\D/g, '') } } } },
    ]

    const rows = await prisma.financeProposal.findMany({
      where: tenantWhere(user.role, tenantId, extra) as never,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { proponent: { select: { nomeCompleto: true, cpf: true } }, bank: { select: { name: true } } },
    })
    const data = rows.map((p) => ({
      id: p.id, status: p.status, vehicle: p.vehicle, installments: p.installments,
      amountRequested: num(p.amountRequested), downPayment: num(p.downPayment),
      approvedValue: num(p.approvedValue), monthlyPayment: num(p.monthlyPayment),
      rejectionReason: p.rejectionReason, notes: p.notes, createdAt: p.createdAt,
      proponentId: p.proponentId, bankId: p.bankId,
      proponentNome: p.proponent?.nomeCompleto ?? '—', proponentCpf: p.proponent?.cpf ?? null,
      bankNome: p.bank?.name ?? null,
    }))
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão para criar fichas.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const d = createProposalSchema.parse(await req.json())
    const proposal = await prisma.financeProposal.create({
      data: {
        tenantId, proponentId: d.proponentId, bankId: d.bankId ?? null, sellerId: d.sellerId ?? null,
        vehicle: d.vehicle ?? null, amountRequested: d.amountRequested ?? null, downPayment: d.downPayment ?? null,
        installments: d.installments ?? null, status: d.status, notes: d.notes ?? null, createdById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinanceProposal', entityId: proposal.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: proposal }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
