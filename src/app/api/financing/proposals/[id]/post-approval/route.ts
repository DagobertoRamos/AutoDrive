// POST /api/financing/proposals/[id]/post-approval — formalização, gravame e
// pagamento do banco (máquinas de estado validadas no servidor).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { advancePostApproval } from '@/lib/finance/fi/orchestrator'
import { FORMALIZATION_STATUS, FUNDING_STATUS, LIEN_STATUS } from '@/lib/finance/fi/status-core'
import { fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }
const base = {
  contractNumber: z.string().max(60).nullable().optional(),
  date: z.string().max(30).nullable().optional(),
  amount: z.number().min(0).max(100_000_000).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
}
const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('formalization'), to: z.enum(FORMALIZATION_STATUS), ...base }),
  z.object({ kind: z.literal('lien'), to: z.enum(LIEN_STATUS), ...base }),
  z.object({ kind: z.literal('funding'), to: z.enum(FUNDING_STATUS), ...base }),
])

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'formalizar' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const d = schema.parse(await req.json())
    const r = await advancePostApproval(id, d.kind, d, auth.actor)
    return NextResponse.json({ success: true, data: r })
  } catch (err) { return fiErrorResponse(err) }
}
