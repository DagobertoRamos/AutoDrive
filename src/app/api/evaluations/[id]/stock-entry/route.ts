// =============================================================================
// POST /api/evaluations/[id]/stock-entry
// Gestor confirma e libera o veículo para o estoque:
//   • cria o Vehicle (status Pend. Preparação — fora do site até resolver)
//   • aplica as pendências: recebimento do veículo + serviços/pendências da avaliação
//   • avaliação → NO_ESTOQUE, vinculada ao veículo
// Body: { stockType?: PROPRIO|CONSIGNADO, salePrice?, purchasePrice?, notes? }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canApproveServices, canViewEvaluation } from '@/lib/evaluation/permissions'
import { recordHistory } from '@/lib/evaluation/history'
import { blockConfirmStockEntry, buildEntryPendencies, EVAL_IN_STOCK } from '@/lib/evaluation/stock-entry-core'
import {
  applyEntryPendencies, defaultStockType, evalLabel, loadEvaluationForStock, notifySeller, vehicleDataFromEvaluation,
} from '@/lib/evaluation/stock-entry'

export const runtime = 'nodejs'

const CLOSED_STOCK = ['VENDIDO', 'CANCELADO', 'DEVOLVIDO'] as const

function money(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await ctxArg.params
  const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
  if (!canApproveServices(user)) {
    return NextResponse.json({ error: 'Apenas gerência pode dar entrada do veículo no estoque.' }, { status: 403 })
  }

  try {
    const ev = await loadEvaluationForStock(id)
    if (!ev) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    if (!canViewEvaluation(user, { tenantId: ev.tenantId } as never)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const blocked = blockConfirmStockEntry(ev)
    if (blocked) return NextResponse.json({ error: blocked, vehicleId: ev.vehicleId ?? undefined }, { status: 409 })
    if (!ev.brand?.trim() || !ev.model?.trim()) {
      return NextResponse.json({ error: 'A avaliação não tem marca e modelo preenchidos.' }, { status: 400 })
    }

    // Mesmo carro já ativo no estoque da loja → não duplica.
    if (ev.plate) {
      const dup = await prisma.vehicle.findFirst({
        where: {
          tenantId: ev.tenantId, active: true,
          plate: { equals: ev.plate.toUpperCase(), mode: 'insensitive' },
          stockStatus: { notIn: [...CLOSED_STOCK] },
        },
        select: { id: true },
      })
      if (dup) {
        return NextResponse.json({ error: `A placa ${ev.plate.toUpperCase()} já está ativa no estoque.`, vehicleId: dup.id }, { status: 409 })
      }
    }

    const body = await req.json().catch(() => ({})) as {
      stockType?: string; salePrice?: unknown; purchasePrice?: unknown; notes?: string; receiveNotes?: string
    }
    const stockType = body.stockType === 'CONSIGNADO' || body.stockType === 'PROPRIO' ? body.stockType : defaultStockType(ev)
    const salePrice     = money(body.salePrice)     ?? money(ev.suggestedSalePrice)
    const purchasePrice = money(body.purchasePrice) ?? money(ev.evaluatedValue)
    const notes         = String(body.notes ?? '').trim().slice(0, 2000) || null

    const services = await prisma.evaluationService.findMany({
      where:  { evaluationId: id },
      select: { description: true, serviceType: true, estimatedCost: true, status: true },
    })
    const pendencies = buildEntryPendencies({
      services:      services.map((s) => ({ ...s, estimatedCost: s.estimatedCost == null ? null : Number(s.estimatedCost) })),
      pendencyNotes: ev.pendencyNotes,
      receiveNotes:  body.receiveNotes,
    })

    const vehicle = await prisma.$transaction(async (tx) => {
      // Trava contra clique duplo: só um confirma enquanto vehicleId é nulo.
      const claimed = await tx.vehicleEvaluation.updateMany({
        where: { id, vehicleId: null },
        data:  { status: EVAL_IN_STOCK, result: 'APROVADO' },
      })
      if (claimed.count === 0) throw new Error('ALREADY_IN_STOCK')

      const v = await tx.vehicle.create({
        data:   vehicleDataFromEvaluation(ev, { stockType, salePrice, purchasePrice, notes }),
        select: { id: true },
      })
      await tx.vehicleEvaluation.update({ where: { id }, data: { vehicleId: v.id, stockType } })
      await applyEntryPendencies(tx, ev.tenantId, v.id, pendencies)
      return v
    })

    await recordHistory({
      tenantId: ev.tenantId ?? '', evaluationId: id,
      userId: session.user.id, userName: session.user.name ?? undefined, userRole: session.user.role,
      action: 'STOCK_ENTRY',
      oldValue: { status: ev.status },
      newValue: { status: EVAL_IN_STOCK, vehicleId: vehicle.id, stockType, salePrice, purchasePrice, pendencies: pendencies.map((p) => p.label) },
    })
    await prisma.auditLog.create({
      data: {
        userId: session.user.id, tenantId: ev.tenantId ?? null, action: 'CREATE', entity: 'Vehicle', entityId: vehicle.id,
        userName: session.user.name ?? null, userRole: session.user.role, status: 'SUCCESS',
        afterData: { originEvaluationId: id, stockType, salePrice, purchasePrice } as never,
      },
    }).catch(() => {})
    await notifySeller(ev, 'Veículo liberado para o estoque',
      `${evalLabel(ev)} entrou no estoque (pendente de recebimento).`, `/estoque/${vehicle.id}`)

    return NextResponse.json({ data: { vehicleId: vehicle.id, evaluationId: id, pendencies: pendencies.map((p) => p.label) } }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_IN_STOCK') {
      return NextResponse.json({ error: 'Esta avaliação já gerou um veículo no estoque.' }, { status: 409 })
    }
    return handlePrismaError(err)
  }
}
