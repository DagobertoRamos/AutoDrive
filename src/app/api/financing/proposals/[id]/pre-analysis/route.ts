// POST /api/financing/proposals/[id]/pre-analysis — pré-análise de crédito num
// banco conectado que oferece a consulta (ex.: BV, PAN). Exige a autorização do
// cliente (o CPF vai ao banco); não cria tentativa — o resultado vai para a linha do tempo.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { preAnalyzeAtBank } from '@/lib/finance/fi/bank-actions'
import { clientIp, fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({ bankId: z.string().min(1).max(60), consent: z.boolean() })

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'enviarFicha' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const d = schema.parse(await req.json())
    const data = await preAnalyzeAtBank(id, d.bankId, { confirmed: d.consent, ip: clientIp(req), userAgent: req.headers.get('user-agent') }, auth.actor)
    return NextResponse.json({ success: true, data })
  } catch (err) { return fiErrorResponse(err) }
}
