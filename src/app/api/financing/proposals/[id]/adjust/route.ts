// POST /api/financing/proposals/[id]/adjust — "Ajustar proposta": nova versão por
// banco com novas condições. Versões anteriores ficam no histórico.
import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { adjustProposal, dispatchAttempt } from '@/lib/finance/fi/orchestrator'
import { clientIp, fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }
const money = z.number().min(0).max(100_000_000).nullable().optional()
const schema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  bankIds: z.array(z.string().min(1).max(60)).max(20).optional(),
  vehicleValue: money, downPayment: money, amount: money,
  installments: z.number().int().min(1).max(120).nullable().optional(),
  coProponentId: z.string().min(1).max(60).nullable().optional(),
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
    const res = await adjustProposal({
      proposalId: id, idempotencyKey: d.idempotencyKey, actor: auth.actor, bankIds: d.bankIds,
      vehicleValue: d.vehicleValue, downPayment: d.downPayment, amount: d.amount, installments: d.installments, coProponentId: d.coProponentId,
      consent: { confirmed: d.consent, ip: clientIp(req), userAgent: req.headers.get('user-agent'), origin: 'INTERNO' }, expectedRevision: d.revision ?? null,
    })
    if (res.dispatch.length) after(async () => { await Promise.allSettled(res.dispatch.map((sid) => dispatchAttempt(sid))) })
    return NextResponse.json({ success: true, data: res.attempts })
  } catch (err) { return fiErrorResponse(err) }
}
