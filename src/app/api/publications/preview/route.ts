// POST /api/publications/preview — prévia por destino (texto final, preço,
// fotos que vão) + pendências com "como resolver" + conferência das imagens.
// { vehicleIds, connectionIds, overrides?: { "<vehicleId>:<connectionId>": {...} }, checkPhotos?: true }
import { NextResponse } from 'next/server'
import { handlePrismaError } from '@/lib/prisma-errors'
import { checkPhotos } from '@/lib/publications/media'
import { ensureSiteConnection, previewTargets } from '@/lib/publications/service'
import { bad, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { vehicleIds?: unknown; connectionIds?: unknown; overrides?: unknown; checkPhotos?: unknown }
  const vehicleIds = Array.isArray(b.vehicleIds) ? b.vehicleIds.filter((x): x is string => typeof x === 'string').slice(0, 50) : []
  const connectionIds = Array.isArray(b.connectionIds) ? b.connectionIds.filter((x): x is string => typeof x === 'string').slice(0, 30) : []
  if (!vehicleIds.length || !connectionIds.length) return bad('Escolha veículos e canais para a prévia.')
  try {
    await ensureSiteConnection(a.tenantId)
    const items = await previewTargets(a.tenantId, vehicleIds, connectionIds, (b.overrides && typeof b.overrides === 'object' ? b.overrides : {}) as Record<string, unknown>)
    let photoChecks: Record<string, Awaited<ReturnType<typeof checkPhotos>>> = {}
    if (b.checkPhotos) {
      const byVehicle = new Map<string, string[]>()
      for (const it of items) if (!byVehicle.has(it.vehicleId)) byVehicle.set(it.vehicleId, it.payload.photos)
      photoChecks = Object.fromEntries(await Promise.all([...byVehicle].slice(0, 10).map(async ([id, urls]) => [id, await checkPhotos(a.tenantId, urls.slice(0, 20))] as const)))
    }
    return NextResponse.json({ success: true, items, photoChecks })
  } catch (e) {
    return handlePrismaError(e)
  }
}
