// GET /api/financing/awaiting-payment — "Aguardando bancos": contratos assinados
// (ou aprovados) cujo pagamento do banco ainda não entrou.
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { listAwaitingPayment } from '@/lib/finance/fi/dashboard'
import { fiAuth, fiErrorResponse, proposalScope } from '@/lib/finance/fi/route'

export async function GET(req: Request) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  try {
    const data = await listAwaitingPayment(auth.tenantId, (await proposalScope(auth.user)) as Prisma.FinanceProposalWhereInput)
    return NextResponse.json({ success: true, data })
  } catch (err) { return fiErrorResponse(err) }
}
