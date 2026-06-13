// =============================================================================
// POST /api/negotiations/[id]/approve — Aprovar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { APPROVABLE_STATUSES }  from '@/lib/negotiation-permissions'
import { notifyDealApproved }   from '@/services/notification.service'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations.approve') }
  catch { return NextResponse.json({ error: 'Sem permissão para aprovar' }, { status: 403 }) }

  try {
    const body  = await req.json().catch(() => ({}))
    const notes = body?.notes as string | undefined

    const deal = await prisma.deal.findUnique({
      where:   { id: params.id },
      include: {
        vehicles: { orderBy: { createdAt: 'asc' } },
        seller:   { select: { fullName: true, shortName: true } },
      },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    if (!APPROVABLE_STATUSES.has(deal.status)) {
      return NextResponse.json({ error: 'Apenas negociações aguardando aprovação podem ser aprovadas' }, { status: 409 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data: {
          status:       'APROVADA',
          approvedById: session.user.id,
          approvedAt:   new Date(),
          approvalNotes: notes ?? null,
          // legado
          releasedAt:       new Date(),
          releasedByUserId: session.user.id,
        } as object,
      })
      await tx.dealStatusHistory.create({
        data: {
          dealId:          params.id,
          previousStatus:  deal.status,
          newStatus:       'APROVADA',
          changedByUserId: session.user.id,
          reason:          notes ?? `Aprovado por ${session.user.name}`,
        },
      })
      await tx.auditLog.create({
        data: {
          userId:   session.user.id,
          tenantId: session.user.tenantId ?? null,
          action:   'APPROVE',
          entity:   'Deal',
          entityId: params.id,
          userName: session.user.name,
          userRole: session.user.role,
          status:   'SUCCESS',
          afterData: { status: 'APROVADA', notes } as never,
        },
      })

      // ── Bloqueia veículo(s) vendidos no estoque ──────────────────────────
      // Aprovação tira o veículo da lista de disponíveis IMEDIATAMENTE
      // (sem aguardar finalize). Status RESERVADO indica "reservado pra venda
      // já aprovada" — fica fora da busca de novas vendas mas histórico OK.
      for (const dv of deal.vehicles) {
        if (dv.vehicleId && (dv.role === 'VENDIDO' || dv.role === 'CONSIGNADO')) {
          await tx.vehicle.update({
            where: { id: dv.vehicleId },
            data:  {
              stockStatus:        'RESERVADO' as never,
              isAvailableForSale: false,
            },
          }).catch((e: unknown) => console.error('[approve] vehicle lock failed', e))

          await tx.auditLog.create({
            data: {
              userId:   session.user.id,
              tenantId: session.user.tenantId ?? null,
              action:   'VEHICLE_BLOCKED_BY_APPROVED_SALE',
              entity:   'Vehicle',
              entityId: dv.vehicleId,
              userName: session.user.name,
              userRole: session.user.role,
              status:   'SUCCESS',
              afterData: { stockStatus: 'RESERVADO', dealId: params.id, dealNumber: deal.dealNumber } as never,
            },
          }).catch(() => {})
        }
      }

      return d
    })

    // ── Notificação sistêmica (broadcast tenant) — best-effort, não bloqueia ──
    try {
      const v = deal.vehicles?.[0]
      const vehicleLabel = [v?.brand, v?.model, v?.year ? `(${v.year})` : null, v?.plate ? `· placa ${v.plate}` : null]
        .filter(Boolean).join(' ').trim() || 'veículo'
      await notifyDealApproved({
        dealId:       params.id,
        dealNumber:   deal.dealNumber,
        dealType:     deal.type,
        tenantId:     deal.tenantId,
        vehicleLabel,
        approverName: session.user.name ?? 'Gerente',
        sellerName:   deal.seller?.shortName ?? deal.seller?.fullName ?? deal.sellerNameFromSheet ?? 'vendedor',
      })
    } catch (e) {
      console.error('[approve] notifyDealApproved failed:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
