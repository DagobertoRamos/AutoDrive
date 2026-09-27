// =============================================================================
// /api/vehicles/[id]/files — arquivos do veículo.
//   GET  ?kind=&refKey=   lista
//   POST multipart { file, kind, refKey? }   envia (PDF/imagem até 10 MB)
// Laudo cautelar recalcula a esteira (Perícia exige laudo anexado).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { listVehicleFiles, saveVehicleFile, validateVehicleFile, VEHICLE_FILE_KINDS, type VehicleFileKind } from '@/lib/stock/vehicle-files'
import { syncIntake } from '@/lib/stock/intake'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function load(ctx: Ctx, write: boolean) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() } as const
  const allowed = write
    ? canAccessModule(user.role, 'stock.manage') || canAccessModule(user.role, 'finance')
    : canAccessModule(user.role, 'stock') || canAccessModule(user.role, 'finance')
  if (!allowed) return { error: forbiddenResponse() } as const
  const tenantId = assertTenantId(user.tenantId, user.role)
  const { id } = await ctx.params
  const vehicle = await prisma.vehicle.findFirst({ where: { id, ...tenantWhere(user.role, tenantId) }, select: { id: true, tenantId: true } })
  if (!vehicle) return { error: NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 }) } as const
  return { user, vehicle } as const
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx, false)
    if ('error' in g) return g.error
    const kind = req.nextUrl.searchParams.get('kind') ?? undefined
    const refKey = req.nextUrl.searchParams.get('refKey') ?? undefined
    return NextResponse.json({ success: true, data: await listVehicleFiles(g.vehicle.id, kind, refKey) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx, true)
    if ('error' in g) return g.error
    const form = await req.formData().catch(() => null)
    const file = form?.get('file') as File | null
    const kind = String(form?.get('kind') ?? '').toUpperCase() as VehicleFileKind
    const refKey = String(form?.get('refKey') ?? '').trim().slice(0, 80) || null
    if (!file) return NextResponse.json({ success: false, error: 'Envie um arquivo.' }, { status: 400 })
    if (!(VEHICLE_FILE_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ success: false, error: 'Tipo de arquivo inválido.' }, { status: 400 })
    const mime = file.type || 'application/octet-stream'
    const invalid = validateVehicleFile(mime, file.size)
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 })

    const saved = await saveVehicleFile({
      tenantId: g.vehicle.tenantId, vehicleId: g.vehicle.id, kind, refKey, fileName: file.name, mimeType: mime,
      bytes: Buffer.from(await file.arrayBuffer()), user: { id: g.user.id, name: g.user.name },
    })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.vehicle.tenantId, action: `VEHICLE_FILE_${kind}`, entity: 'VehicleFile', entityId: saved.id, userName: g.user.name, userRole: g.user.role, afterData: { refKey, fileName: saved.fileName } })
    if (kind === 'LAUDO_CAUTELAR') await syncIntake(g.vehicle.id, { id: g.user.id, name: g.user.name, role: g.user.role })
    return NextResponse.json({ success: true, data: saved }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
