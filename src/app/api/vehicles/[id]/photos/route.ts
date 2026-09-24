// =============================================================================
// /api/vehicles/[id]/photos — painel de fotos do estoque. Gate: stock.manage.
//   POST   multipart files[] : envia fotos (já comprimidas no navegador)
//   PATCH  { order?: id[], mainId? } : reordena e/ou define a principal
//   DELETE ?photoId= : exclui
// Fotos guardadas em site_assets (kind VEHICLE_PHOTO) e servidas por
// /api/site/assets/<id>. Com a 1ª foto o carro passa a "Publicado" no site.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { assetIdFromUrl, ImageRejected, storeTenantImage } from '@/lib/site/assets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PHOTOS = 40
const MAX_BYTES = 4 * 1024 * 1024
type Ctx = { params: Promise<{ id: string }> }

async function guard(ctx: Ctx) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() } as const
  if (!canAccessModule(user.role, 'stock.manage')) return { error: forbiddenResponse('Sem permissão para editar o estoque.') } as const
  { const gate = await assertModuleEnabled(user, 'stock.view'); if (gate) return { error: gate } as const }
  const tenantId = assertTenantId(user.tenantId, user.role)
  const { id } = await ctx.params
  const vehicle = await prisma.vehicle.findFirst({ where: { id, ...tenantWhere(user.role, tenantId) }, select: { id: true, tenantId: true } })
  if (!vehicle) return { error: NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 }) } as const
  return { user, vehicle } as const
}

async function photoList(vehicleId: string) {
  return prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { mainPhotoUrl: true, photos: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } })
}

/** Garante exatamente uma principal (a marcada, senão a primeira) e sincroniza mainPhotoUrl. */
async function normalizeMain(vehicleId: string) {
  const photos = await prisma.vehiclePhoto.findMany({ where: { vehicleId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
  const main = photos.find((p) => p.isMain) ?? photos[0] ?? null
  await prisma.$transaction([
    prisma.vehiclePhoto.updateMany({ where: { vehicleId, NOT: { id: main?.id ?? '' } }, data: { isMain: false } }),
    ...(main ? [prisma.vehiclePhoto.update({ where: { id: main.id }, data: { isMain: true } })] : []),
    prisma.vehicle.update({ where: { id: vehicleId }, data: { mainPhotoUrl: main?.url ?? null } }),
  ])
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const g = await guard(ctx)
    if ('error' in g) return g.error
    const { vehicle, user } = g
    const tenantId = vehicle.tenantId
    if (!tenantId) return NextResponse.json({ success: false, error: 'Veículo sem loja.' }, { status: 400 })

    const form = await req.formData().catch(() => null)
    const files = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof Blob)
    if (!files.length) return NextResponse.json({ success: false, error: 'Nenhuma foto enviada.' }, { status: 400 })
    const current = await prisma.vehiclePhoto.count({ where: { vehicleId: vehicle.id } })
    if (current + files.length > MAX_PHOTOS) return NextResponse.json({ success: false, error: `Limite de ${MAX_PHOTOS} fotos por veículo.` }, { status: 400 })
    const last = await prisma.vehiclePhoto.findFirst({ where: { vehicleId: vehicle.id }, orderBy: { order: 'desc' }, select: { order: true } })

    let order = (last?.order ?? -1) + 1
    const rejected: string[] = []
    for (const f of files) {
      if (f.size > MAX_BYTES) { rejected.push(`${f.name || 'foto'}: acima de 4 MB`); continue }
      try {
        const saved = await storeTenantImage(tenantId, 'VEHICLE_PHOTO', new Uint8Array(await f.arrayBuffer()))
        await prisma.vehiclePhoto.create({ data: { vehicleId: vehicle.id, url: saved.url, order: order++, isMain: false } })
      } catch (e) {
        if (e instanceof ImageRejected) rejected.push(`${f.name || 'foto'}: formato não aceito`)
        else throw e
      }
    }
    await normalizeMain(vehicle.id)
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPLOAD_PHOTOS', entity: 'Vehicle', entityId: vehicle.id, userName: user.name, userRole: user.role, afterData: { added: files.length - rejected.length, rejected } })
    return NextResponse.json({ success: true, data: await photoList(vehicle.id), rejected }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const g = await guard(ctx)
    if ('error' in g) return g.error
    const { vehicle } = g
    const body = await req.json().catch(() => ({})) as { order?: unknown; mainId?: unknown }
    const photos = await prisma.vehiclePhoto.findMany({ where: { vehicleId: vehicle.id }, select: { id: true } })
    const ids = new Set(photos.map((p) => p.id))

    if (Array.isArray(body.order)) {
      const order = body.order.filter((x): x is string => typeof x === 'string' && ids.has(x))
      // Fotos que não vieram na lista vão para o fim, na ordem atual.
      const rest = photos.map((p) => p.id).filter((x) => !order.includes(x))
      await prisma.$transaction([...order, ...rest].map((id, i) => prisma.vehiclePhoto.update({ where: { id }, data: { order: i } })))
    }
    if (typeof body.mainId === 'string' && ids.has(body.mainId)) {
      await prisma.$transaction([
        prisma.vehiclePhoto.updateMany({ where: { vehicleId: vehicle.id }, data: { isMain: false } }),
        prisma.vehiclePhoto.update({ where: { id: body.mainId }, data: { isMain: true } }),
      ])
    }
    await normalizeMain(vehicle.id)
    return NextResponse.json({ success: true, data: await photoList(vehicle.id) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const g = await guard(ctx)
    if ('error' in g) return g.error
    const { vehicle, user } = g
    const photoId = new URL(req.url).searchParams.get('photoId') ?? ''
    const photo = await prisma.vehiclePhoto.findFirst({ where: { id: photoId, vehicleId: vehicle.id } })
    if (!photo) return NextResponse.json({ success: false, error: 'Foto não encontrada.' }, { status: 404 })
    await prisma.vehiclePhoto.delete({ where: { id: photo.id } })
    const assetId = assetIdFromUrl(photo.url)
    if (assetId) await prisma.siteAsset.deleteMany({ where: { id: assetId, tenantId: vehicle.tenantId ?? '', kind: 'VEHICLE_PHOTO' } })
    await normalizeMain(vehicle.id)
    await createSafeAuditLog({ userId: user.id, tenantId: vehicle.tenantId, action: 'DELETE_PHOTO', entity: 'Vehicle', entityId: vehicle.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: await photoList(vehicle.id) })
  } catch (err) {
    return handlePrismaError(err)
  }
}
