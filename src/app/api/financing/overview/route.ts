// GET /api/financing/overview — Visão geral do F&I (números + "Precisa da sua atenção").
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { buildDashboard } from '@/lib/finance/fi/dashboard'
import { fiAuth, fiErrorResponse, proposalScope } from '@/lib/finance/fi/route'

export async function GET(req: Request) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  try {
    const data = await buildDashboard(auth.tenantId, (await proposalScope(auth.user)) as Prisma.FinanceProposalWhereInput)
    return NextResponse.json({ success: true, data })
  } catch (err) { return fiErrorResponse(err) }
}
