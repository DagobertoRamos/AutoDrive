// POST /api/financing/proposals/[id]/send — envia a ficha aos bancos escolhidos.
// Idempotente (idempotencyKey por clique). Bancos integrados são chamados em
// segundo plano (after) — a tela acompanha o resultado sem travar.
import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { dispatchAttempt, sendToBanks } from '@/lib/finance/fi/orchestrator'
import { clientIp, fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({
  bankIds: z.array(z.string().min(1).max(60)).min(1, 'Escolha pelo menos um banco.').max(20),
  idempotencyKey: z.string().min(8).max(100),
  consent: z.boolean(),
  revision: z.number().int().optional(),
})

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'enviarFicha' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const d = schema.parse(await req.json())
    const res = await sendToBanks({
      proposalId: id, bankIds: d.bankIds, idempotencyKey: d.idempotencyKey, actor: auth.actor, expectedRevision: d.revision ?? null,
      consent: { confirmed: d.consent, ip: clientIp(req), userAgent: req.headers.get('user-agent'), origin: 'INTERNO' },
    })
    if (res.dispatch.length) after(async () => { await Promise.allSettled(res.dispatch.map((sid) => dispatchAttempt(sid))) })
    return NextResponse.json({ success: true, data: res.attempts })
  } catch (err) { return fiErrorResponse(err) }
}
