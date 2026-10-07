// POST /api/financing/proposals/[id]/cancel — cancela a ficha e as propostas abertas.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cancelProposal } from '@/lib/finance/fi/orchestrator'
import { fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'cancelarProposta' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const d = z.object({ reason: z.string().trim().min(3, 'Informe o motivo do cancelamento.').max(300) }).parse(await req.json())
    const r = await cancelProposal(id, d.reason, auth.actor)
    return NextResponse.json({ success: true, data: r })
  } catch (err) { return fiErrorResponse(err) }
}
