// =============================================================================
// POST /api/evaluations/[id]/customer-decision
//
// Registra a decisão do cliente sobre a proposta liberada pelo gerente.
// Decisões aceitas:
//   ACEITA      → veículo passa a ficar disponível pras operações em availableFor
//   RECUSADA    → bloqueado (motivo opcional)
//   ANALISANDO  → cliente ainda pensando
//   EXPIRADA    → admin marca como vencida manualmente
//   CANCELADA   → proposta cancelada
//
// Permissão: vendedor pode registrar ACEITA/RECUSADA/ANALISANDO; só gerente+
// pode marcar EXPIRADA/CANCELADA.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

const ALLOWED_DECISIONS    = new Set(['ACEITA', 'RECUSADA', 'ANALISANDO', 'EXPIRADA', 'CANCELADA'])
const MANAGER_PLUS         = new Set(['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'])
const MANAGER_ONLY_DECISIONS = new Set(['EXPIRADA', 'CANCELADA'])

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const params = await Promise.resolve(ctxArg.params)
  const evalId = params?.id
  if (!evalId) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })

  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'stock') } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: { decision?: string; note?: string; availableFor?: string[] } = {}
  try { body = await req.json() } catch { /* sem body */ }

  const decision = String(body.decision ?? '').toUpperCase()
  if (!ALLOWED_DECISIONS.has(decision)) {
    return NextResponse.json(
      { error: `Decisão inválida. Use: ${Array.from(ALLOWED_DECISIONS).join(', ')}` },
      { status: 400 },
    )
  }
  if (MANAGER_ONLY_DECISIONS.has(decision) && !MANAGER_PLUS.has(session.user.role)) {
    return NextResponse.json(
      { error: 'Apenas gerente+ pode marcar como EXPIRADA ou CANCELADA.' },
      { status: 403 },
    )
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev: any = await (prisma as any).vehicleEvaluation.findUnique({
      where:  { id: evalId },
      select: { id: true, tenantId: true, status: true, result: true, customerDecision: true, availableFor: true },
    })
    if (!ev) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    if (session.user.tenantId && ev.tenantId && ev.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Atualiza decisão + (opcionalmente) availableFor quando vier do payload e
    // for gerente+ marcando ACEITA. Vendedor não muda availableFor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      customerDecision:     decision,
      customerDecisionAt:   new Date(),
      customerDecisionById: session.user.id,
      customerDecisionNote: body.note?.toString() || null,
    }
    if (decision === 'ACEITA' && Array.isArray(body.availableFor) && MANAGER_PLUS.has(session.user.role)) {
      const filtered = body.availableFor
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => ['COMPRA', 'TROCA', 'CONSIGNACAO'].includes(s))
      if (filtered.length > 0) data.availableFor = filtered.join(',')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma as any).vehicleEvaluation.update({
      where: { id: evalId },
      data,
      select: {
        id: true, customerDecision: true, customerDecisionAt: true,
        customerDecisionById: true, customerDecisionNote: true, availableFor: true,
      },
    })

    // AuditLog
    await prisma.auditLog.create({
      data: {
        userId:    session.user.id,
        tenantId:  ev.tenantId ?? null,
        action:    `CUSTOMER_DECISION_${decision}`,
        entity:    'VehicleEvaluation',
        entityId:  evalId,
        userName:  session.user.name ?? null,
        userRole:  session.user.role,
        status:    'SUCCESS',
        beforeData: { customerDecision: ev.customerDecision ?? 'PENDENTE' } as never,
        afterData:  data as never,
      },
    }).catch(() => {})

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
