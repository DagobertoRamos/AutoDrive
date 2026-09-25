// =============================================================================
// /api/publications/[id]
//   GET   detalhe: situação, prévia do que vai ao canal, histórico e
//         diagnóstico técnico (tarefas, tentativas, respostas — sem segredos)
//   PATCH ajuste específico deste destino (título, descrição, preço, fotos)
//         — fica no histórico; anúncio no ar recebe atualização
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { vehicleTitle } from '@/lib/site/listing-core'
import { channelSpec } from '@/lib/publications/channels'
import { channelText } from '@/lib/publications/content-core'
import { STATUS_LABEL, type PubStatus } from '@/lib/publications/states'
import { validatePayload } from '@/lib/publications/validate-core'
import { buildFor, loadVehicle, logEvent, syncLive } from '@/lib/publications/service'
import { audit, bad, kickWorker, permissions, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  const pub = await prisma.publication.findFirst({ where: { id, tenantId: a.tenantId }, include: { connection: { select: { id: true, label: true, status: true, channel: true, environment: true } } } })
  if (!pub) return bad('Publicação não encontrada.', 404)
  const v = await loadVehicle(a.tenantId, pub.vehicleId)
  const spec = channelSpec(pub.channel)
  const [events, jobs] = await Promise.all([
    prisma.publicationEvent.findMany({ where: { tenantId: a.tenantId, publicationId: id }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.publicationJob.findMany({ where: { tenantId: a.tenantId, publicationId: id }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, op: true, status: true, priority: true, attempts: true, maxAttempts: true, runAt: true, lastError: true, lastErrorKind: true, outcomeUnknown: true, result: true, createdAt: true, finishedAt: true, generation: true } }),
  ])
  let preview = null
  if (v && spec) {
    const p = await buildFor(a.tenantId, v, pub.externalRef, pub.overrides)
    const t = channelText(p, spec)
    preview = { title: t.title, description: t.description, price: p.price, oldPrice: p.oldPrice, photos: p.photos.slice(0, spec.media.max), issues: validatePayload(p, spec) }
  }
  return NextResponse.json({
    success: true,
    data: {
      publication: { ...pub, statusLabel: STATUS_LABEL[pub.status as PubStatus] ?? pub.status },
      vehicle: v ? { id: v.id, title: vehicleTitle(v), plate: v.plate, stockStatus: v.stockStatus, cover: v.photos[0]?.url ?? null, gallery: v.photos.map((p) => p.url) } : null,
      channel: spec ? { id: spec.id, name: spec.name, capabilities: spec.capabilities, media: spec.media, text: spec.text, campaigns: spec.campaigns } : null,
      preview, events, jobs, can: await permissions(a.user),
    },
  })
}

export async function PATCH(req: Request, ctx: Ctx) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  const pub = await prisma.publication.findFirst({ where: { id, tenantId: a.tenantId } })
  if (!pub) return bad('Publicação não encontrada.', 404)
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const s = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined)
  const price = b.price === '' || b.price == null ? undefined : Number(b.price)
  if (price !== undefined && (!Number.isFinite(price) || price <= 0)) return bad('Preço inválido.')
  const overrides = {
    title: s(b.title, 150), description: s(b.description, 6000), conditions: s(b.conditions, 1000), price,
    photos: Array.isArray(b.photos) ? b.photos.filter((x): x is string => typeof x === 'string').slice(0, 60) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined))
  try {
    await prisma.publication.update({ where: { id }, data: { overrides: Object.keys(clean).length ? (clean as Prisma.InputJsonValue) : Prisma.DbNull, updatedById: a.user.id } })
    await logEvent(prisma, { tenantId: a.tenantId, publicationId: id, vehicleId: pub.vehicleId, channel: pub.channel, type: 'AJUSTE_CANAL', message: 'Conteúdo específico deste canal alterado.', actor: a.actor, data: { antes: pub.overrides, depois: clean } })
    await audit(a, 'UPDATE', 'PublicationOverrides', id, clean, pub.overrides)
    const updates = await syncLive(a.tenantId, pub.vehicleId, a.actor)
    if (updates) kickWorker()
    return NextResponse.json({ success: true, updates })
  } catch (e) {
    return handlePrismaError(e)
  }
}
