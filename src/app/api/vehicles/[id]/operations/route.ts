// =============================================================================
// /api/vehicles/[id]/operations — situação operacional do veículo.
//   GET  → status geral, prontidão para venda, RENAVE, documentos, linha do
//          tempo recente, restrições, vistorias, consignação, transferência.
//   POST { action, ... } → renave.entry | intake.ensure | restriction.add | restriction.resolve
//          | inspection.add | inspection.cancel | consignment.save
//          | storeTransfer.request | storeTransfer.decide
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { vehicleGuard } from '@/lib/stock/vehicle-guard'
import { opsPermissions } from '@/lib/automotive/access'
import { vehicleOverview } from '@/lib/automotive/overview'
import { renaveEntryForVehicle } from '@/lib/automotive/renave'
import { ensureIntakeOperation } from '@/lib/automotive/operations'
import { addInspection, addRestriction, cancelInspection, decideStoreTransfer, requestStoreTransfer, resolveRestriction, saveConsignment } from '@/lib/automotive/vehicle-registry'
import { opsError, opsSession, requireOps } from '@/lib/automotive/route-helpers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'read')
    if ('error' in g) return g.error
    const perms = await opsPermissions(g.user)
    const data = await vehicleOverview(id, { costs: perms['ops.costs.view'] })
    if (!data) return NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 })
    const units = perms['ops.store_transfer'] && g.vehicle.tenantId
      ? await prisma.unit.findMany({ where: { tenantId: g.vehicle.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : []
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        fiscalDocs: perms['ops.fiscal.view'] ? data.fiscalDocs : [],
        units,
        // Quem pode aceitar a transferência: gestão da loja de destino (ou ADM/MASTER).
        canDecideTransfer: !!data.storeTransfer && perms['ops.store_transfer'] && (['MASTER', 'ADM', 'GERENTE_GERAL'].includes(g.user.role) || (g.user as { unitId?: string | null }).unitId === data.storeTransfer.toUnitId),
        permissions: perms,
      },
    })
  } catch (err) {
    return opsError(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'read')
    if ('error' in g) return g.error
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    const b = await req.json().catch(() => ({})) as Record<string, any>
    const action = String(b.action ?? '')
    const deny = async (perm: Parameters<typeof requireOps>[1]) => requireOps(s, perm)

    switch (action) {
      case 'renave.entry': {
        const d = await deny('ops.renave.operate'); if (d) return d
        const op = await renaveEntryForVehicle(id, s.tenantId, b.manual ?? {}, s.actor)
        return NextResponse.json({ success: true, data: { operationId: op.id } })
      }
      case 'intake.ensure': {
        const d = await deny('ops.fiscal.issue'); if (d) return d
        const op = await ensureIntakeOperation(id, s.actor)
        return NextResponse.json({ success: true, data: { operationId: op.id } })
      }
      case 'restriction.add': {
        const d = await deny('ops.compliance.manage'); if (d) return d
        return NextResponse.json({ success: true, data: await addRestriction(id, s.tenantId, b, s.actor) })
      }
      case 'restriction.resolve': {
        const d = await deny('ops.compliance.manage'); if (d) return d
        return NextResponse.json({ success: true, data: await resolveRestriction(String(b.restrictionId ?? ''), s.tenantId, String(b.resolution ?? ''), s.actor) })
      }
      case 'inspection.add': {
        const d = await deny('ops.compliance.manage'); if (d) return d
        return NextResponse.json({ success: true, data: await addInspection(id, s.tenantId, b, s.actor) })
      }
      case 'inspection.cancel': {
        const d = await deny('ops.compliance.manage'); if (d) return d
        return NextResponse.json({ success: true, data: await cancelInspection(String(b.inspectionId ?? ''), s.tenantId, s.actor) })
      }
      case 'consignment.save': {
        const d = await deny('ops.compliance.manage'); if (d) return d
        return NextResponse.json({ success: true, data: await saveConsignment(id, s.tenantId, b, s.actor) })
      }
      case 'storeTransfer.request': {
        const d = await deny('ops.store_transfer'); if (d) return d
        return NextResponse.json({ success: true, data: await requestStoreTransfer(id, s.tenantId, String(b.toUnitId ?? ''), b.reason ?? null, s.actor) })
      }
      case 'storeTransfer.decide': {
        const d = await deny('ops.store_transfer'); if (d) return d
        const t = await prisma.storeTransfer.findFirst({ where: { id: String(b.transferId ?? ''), vehicleId: id } })
        if (!t) return NextResponse.json({ success: false, error: 'Transferência não encontrada.' }, { status: 404 })
        const decision = b.decision === 'ACCEPT' ? 'ACCEPT' : b.decision === 'REJECT' ? 'REJECT' : 'CANCEL'
        // Aceitar/recusar: gestão do destino; cancelar: quem pediu ou gestão sênior.
        const senior = ['MASTER', 'ADM', 'GERENTE_GERAL'].includes(s.user.role)
        const atDestination = (s.user as { unitId?: string | null }).unitId === t.toUnitId
        if (decision !== 'CANCEL' && !senior && !atDestination) return NextResponse.json({ success: false, error: 'Só a gestão da loja de destino aceita ou recusa.' }, { status: 403 })
        if (decision === 'CANCEL' && !senior && t.requestedById !== s.user.id) return NextResponse.json({ success: false, error: 'Só quem pediu pode cancelar.' }, { status: 403 })
        return NextResponse.json({ success: true, data: await decideStoreTransfer(t.id, s.tenantId, decision, b.note ?? null, s.actor) })
      }
      default:
        return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
    }
  } catch (err) {
    return opsError(err)
  }
}
