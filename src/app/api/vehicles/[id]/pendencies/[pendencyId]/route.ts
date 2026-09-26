// =============================================================================
// PATCH /api/vehicles/[id]/pendencies/[pendencyId] — resolve/reabre uma
// pendência de estoque e recalcula a esteira de entrada. Gate: stock.manage.
// Body:
//   { resolved: boolean, note? }                    qualquer pendência
//   Perícia:     { cautelarStatus }                 (a perícia é derivada da cautelar)
//   Recebimento: { resolved: true, receivedAt?, km?, note? }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { CautelarStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { GATE_INSPECTION, GATE_RECEIVE, sameLabel } from '@/lib/stock/intake-core'
import { syncIntake } from '@/lib/stock/intake'

export const dynamic = 'force-dynamic'

const CAUTELAR = new Set(['APROVADA', 'REPROVADA', 'PENDENTE', 'COM_APONTAMENTO', 'SEM_CAUTELAR'])

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; pendencyId: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage')) return forbiddenResponse('Sem permissão para editar o estoque.')
  { const gate = await assertModuleEnabled(user, 'stock.view'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { id, pendencyId } = await ctx.params
    const body = await req.json().catch(() => ({})) as { resolved?: unknown; cautelarStatus?: unknown; receivedAt?: unknown; km?: unknown; note?: unknown }

    const pend = await prisma.vehicleStockPendency.findFirst({
      where:  { id: pendencyId, vehicleId: id, vehicle: { ...tenantWhere(user.role, tenantId) } },
      select: { id: true, resolved: true, notes: true, option: { select: { label: true } }, vehicle: { select: { tenantId: true, km: true } } },
    })
    if (!pend) return NextResponse.json({ success: false, error: 'Pendência não encontrada.' }, { status: 404 })
    const actor = { id: user.id, name: user.name, role: user.role }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''

    if (sameLabel(pend.option.label, GATE_INSPECTION)) {
      // Perícia: grava a cautelar do veículo; a esteira deriva o portão.
      const cs = String(body.cautelarStatus ?? '').toUpperCase()
      if (!CAUTELAR.has(cs)) {
        return NextResponse.json({ success: false, error: 'Informe o status da perícia (pendente, aprovada, com apontamento ou reprovada).' }, { status: 400 })
      }
      await prisma.vehicle.update({ where: { id }, data: { cautelarStatus: cs as CautelarStatus } })
      if (note) await prisma.vehicleStockPendency.update({ where: { id: pendencyId }, data: { notes: note } })
    } else {
      if (typeof body.resolved !== 'boolean') {
        return NextResponse.json({ success: false, error: 'Informe resolved: true ou false.' }, { status: 400 })
      }
      let notes = pend.notes
      let kmUpdate: number | null = null
      if (body.resolved && sameLabel(pend.option.label, GATE_RECEIVE)) {
        const when = typeof body.receivedAt === 'string' && !isNaN(Date.parse(body.receivedAt)) ? new Date(body.receivedAt) : new Date()
        const km = Number(body.km)
        kmUpdate = Number.isFinite(km) && km > 0 && km < 3_000_000 ? Math.round(km) : null
        notes = [
          `Recebido em ${when.toLocaleDateString('pt-BR')} por ${user.name ?? 'usuário'}`,
          kmUpdate != null ? `km ${kmUpdate.toLocaleString('pt-BR')}` : null,
          note || null,
        ].filter(Boolean).join(' · ')
      } else if (note) {
        notes = note
      }
      await prisma.vehicleStockPendency.update({
        where: { id: pendencyId },
        data:  body.resolved
          ? { resolved: true, resolvedAt: new Date(), resolvedById: user.id, notes }
          : { resolved: false, resolvedAt: null, resolvedById: null, notes },
      })
      if (kmUpdate != null) await prisma.vehicle.update({ where: { id }, data: { km: kmUpdate } })
    }

    const intake = await syncIntake(id, actor)
    const updated = await prisma.vehicleStockPendency.findUnique({
      where: { id: pendencyId }, include: { option: true, resolvedBy: { select: { id: true, name: true } } },
    })
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { stockStatus: true, cautelarStatus: true, km: true } })

    await createSafeAuditLog({
      userId: user.id, tenantId: pend.vehicle.tenantId ?? null, action: 'UPDATE', entity: 'VehicleStockPendency', entityId: pendencyId,
      userName: user.name, userRole: user.role, beforeData: { resolved: pend.resolved }, afterData: { resolved: updated?.resolved, stockStatus: vehicle?.stockStatus },
    })

    return NextResponse.json({ success: true, data: updated, vehicle, intake })
  } catch (err) {
    return handlePrismaError(err)
  }
}
