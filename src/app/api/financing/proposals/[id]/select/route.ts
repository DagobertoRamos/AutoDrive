// POST   /api/financing/proposals/[id]/select — escolhe a proposta aprovada (gera a
//        previsão de recebimento na negociação). DELETE desfaz antes da formalização.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { selectOffer, unselectOffer } from '@/lib/finance/fi/orchestrator'
import { fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'enviarFicha' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const d = z.object({ submissionId: z.string().min(1).max(60) }).parse(await req.json())
    await selectOffer(id, d.submissionId, auth.actor)
    return NextResponse.json({ success: true })
  } catch (err) { return fiErrorResponse(err) }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'formalizar' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    await unselectOffer(id, auth.actor)
    return NextResponse.json({ success: true })
  } catch (err) { return fiErrorResponse(err) }
}
