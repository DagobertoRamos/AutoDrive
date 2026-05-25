// =============================================================================
// /api/negotiations/[id]/debts/[debtId] — Editar e remover débito
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { canEditDeal }          from '@/lib/negotiation-rbac'

async function getDealAndCheck(dealId: string, session: { user: { tenantId?: string | null; role: string; id: string; name?: string | null } }) {
  const deal = await prisma.deal.findUnique({
    where:  { id: dealId },
    select: { id: true, tenantId: true, status: true, sellerId: true },
  })
  if (!deal) return { deal: null, err: NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 }) }
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return { deal: null, err: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }
  const actor = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId ?? null, sellerId: deal.sellerId }
  if (!canEditDeal(actor, deal)) {
    return { deal: null, err: NextResponse.json({ error: 'Negociação não pode ser editada neste status.' }, { status: 409 }) }
  }
  return { deal, err: null }
}

// ── PATCH — Editar débito ─────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; debtId: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  const { deal, err } = await getDealAndCheck(params.id, session)
  if (err) return err

  try {
    const body = await req.json()
    const { vehicleRole, type, description, value, responsavel, notes, dueDate } = body

    const updated = await (prisma.dealDebt as any).update({
      where: { id: params.debtId },
      data: {
        ...(vehicleRole !== undefined && { vehicleRole }),
        ...(type        !== undefined && { type        }),
        ...(description !== undefined && { description }),
        ...(value       !== undefined && { value: Number(value) }),
        ...(responsavel !== undefined && { responsavel }),
        ...(notes       !== undefined && { notes       }),
        ...(dueDate     !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      },
    })

    void deal // used for check above

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── DELETE — Remover débito ───────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; debtId: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  const { deal, err } = await getDealAndCheck(params.id, session)
  if (err) return err

  try {
    await (prisma.dealDebt as any).delete({ where: { id: params.debtId } })
    void deal // used for check above

    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId: session.user.tenantId ?? null,
        action:   'DELETE',
        entity:   'DealDebt',
        entityId: params.debtId,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
        afterData: { dealId: params.id } as never,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
