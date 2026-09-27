// =============================================================================
// /api/vehicles/[id]/reception — recebimento do veículo (checklist com fotos).
//   GET  → itens, fotos por item, km/data, o que falta
//   PUT  { items, km, receivedAt, notes }          salva o rascunho
//   POST { action: 'confirm' | 'reopen' }          confirma (exige tudo) / reabre
// Confirmar resolve o portão "Recebimento do veículo" e atualiza o km da ficha.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { vehicleGuard } from '@/lib/stock/vehicle-guard'
import { RECEPTION_ITEMS, receptionMissing, type ReceptionItem } from '@/lib/stock/prep-core'
import { listVehicleFiles } from '@/lib/stock/vehicle-files'
import { GATE_RECEIVE, sameLabel } from '@/lib/stock/intake-core'
import { syncIntake } from '@/lib/stock/intake'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

function cleanItems(v: unknown): ReceptionItem[] {
  const keys = new Set<string>(RECEPTION_ITEMS.map((i) => i.key))
  return (Array.isArray(v) ? v : []).flatMap((x) => {
    const o = x as Record<string, unknown>
    const key = String(o?.key ?? '')
    if (!keys.has(key)) return []
    const status = o.status === 'NAO_POSSUI' ? 'NAO_POSSUI' : o.status === 'OK' ? 'OK' : 'PENDENTE'
    return [{ key, status, note: String(o.note ?? '').trim().slice(0, 300) || null } as ReceptionItem]
  })
}

async function state(vehicleId: string) {
  const [rec, photos, v] = await Promise.all([
    prisma.vehicleReception.findUnique({ where: { vehicleId } }),
    listVehicleFiles(vehicleId, 'RECEBIMENTO'),
    prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { km: true } }),
  ])
  const items = cleanItems(rec?.items)
  const photosByKey: Record<string, number> = {}
  for (const p of photos) if (p.refKey) photosByKey[p.refKey] = (photosByKey[p.refKey] ?? 0) + 1
  return {
    catalog: RECEPTION_ITEMS, items, photos, km: rec?.km ?? v?.km ?? null, receivedAt: rec?.receivedAt ?? null, notes: rec?.notes ?? null,
    confirmedAt: rec?.confirmedAt ?? null, confirmedByName: rec?.confirmedByName ?? null, missing: receptionMissing(items, photosByKey),
  }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'read')
    if ('error' in g) return g.error
    return NextResponse.json({ success: true, data: await state(id) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'write')
    if ('error' in g) return g.error
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const km = b.km == null || b.km === '' ? null : Math.round(Number(b.km))
    if (km != null && (!Number.isFinite(km) || km < 0 || km > 3_000_000)) return NextResponse.json({ success: false, error: 'Km inválido.' }, { status: 400 })
    const receivedAt = typeof b.receivedAt === 'string' && !isNaN(Date.parse(b.receivedAt)) ? new Date(b.receivedAt) : null
    const data = { items: cleanItems(b.items) as unknown as Prisma.InputJsonValue, km, receivedAt, notes: String(b.notes ?? '').trim().slice(0, 2000) || null }
    await prisma.vehicleReception.upsert({ where: { vehicleId: id }, create: { vehicleId: id, tenantId: g.vehicle.tenantId, ...data }, update: data })
    return NextResponse.json({ success: true, data: await state(id) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'write')
    if ('error' in g) return g.error
    const { action } = await req.json().catch(() => ({})) as { action?: string }
    const actor = { id: g.user.id, name: g.user.name, role: g.user.role }
    const gate = (await prisma.vehicleStockPendency.findMany({ where: { vehicleId: id }, select: { id: true, option: { select: { label: true } } } }))
      .find((p) => sameLabel(p.option.label, GATE_RECEIVE))

    if (action === 'reopen') {
      await prisma.vehicleReception.updateMany({ where: { vehicleId: id }, data: { confirmedAt: null, confirmedById: null, confirmedByName: null } })
      if (gate) await prisma.vehicleStockPendency.update({ where: { id: gate.id }, data: { resolved: false, resolvedAt: null, resolvedById: null, notes: 'Recebimento reaberto.' } })
      await syncIntake(id, actor)
      return NextResponse.json({ success: true, data: await state(id) })
    }
    if (action !== 'confirm') return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })

    const cur = await state(id)
    if (!cur.receivedAt) cur.missing.unshift('data da chegada')
    if (cur.km == null) cur.missing.unshift('km na chegada')
    if (cur.missing.length) return NextResponse.json({ success: false, error: `Falta: ${cur.missing.join('; ')}.`, missing: cur.missing }, { status: 400 })

    const now = new Date()
    await prisma.vehicleReception.update({ where: { vehicleId: id }, data: { confirmedAt: now, confirmedById: g.user.id, confirmedByName: g.user.name ?? null } })
    await prisma.vehicle.update({ where: { id }, data: { km: cur.km } })
    const semItem = cur.items.filter((i) => i.status === 'NAO_POSSUI').map((i) => RECEPTION_ITEMS.find((c) => c.key === i.key)?.label).filter(Boolean)
    const notes = [
      `Recebido em ${new Date(cur.receivedAt!).toLocaleDateString('pt-BR')} por ${g.user.name ?? 'usuário'} · km ${cur.km!.toLocaleString('pt-BR')}`,
      `${cur.photos.length} foto(s) do checklist`,
      semItem.length ? `Não possui: ${semItem.join(', ')}` : null,
    ].filter(Boolean).join(' · ')
    if (gate) await prisma.vehicleStockPendency.update({ where: { id: gate.id }, data: { resolved: true, resolvedAt: now, resolvedById: g.user.id, notes } })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.vehicle.tenantId, action: 'VEHICLE_RECEIVED', entity: 'Vehicle', entityId: id, userName: g.user.name, userRole: g.user.role, afterData: { km: cur.km, photos: cur.photos.length, semItem } })
    await syncIntake(id, actor)
    return NextResponse.json({ success: true, data: await state(id) })
  } catch (err) {
    return handlePrismaError(err)
  }
}
