// POST /api/financing/proposals/[id]/formalization-link — pede ao banco da
// proposta escolhida o link de formalização digital (documentos + assinatura do
// cliente). Só para bancos com a capacidade na integração oficial (ex.: PAN).
import { NextResponse } from 'next/server'
import { requestFormalizationLink } from '@/lib/finance/fi/bank-actions'
import { fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'formalizar' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const data = await requestFormalizationLink(id, auth.actor)
    return NextResponse.json({ success: true, data })
  } catch (err) { return fiErrorResponse(err) }
}
