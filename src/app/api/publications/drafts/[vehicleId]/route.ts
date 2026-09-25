// =============================================================================
// /api/publications/drafts/[vehicleId]
//   GET  ficha + fotos (tratadas e originais) + conteúdo preparado + revisões
//   PUT  salva título/descrição/condições/preço (gate: .prepare)
//   POST { action: 'preparar' }  → registra as fotos atuais como revisão pendente (.prepare)
//        { action: 'aprovar', photos:[...] } → aprova capa+ordem (.approve);
//          com a regra automática ligada, publica nos destinos da regra
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { effectivePrice, vehicleTitle } from '@/lib/site/listing-core'
import { autoDescription, baseTitle } from '@/lib/publications/content-core'
import { approveMedia, factsOf, loadVehicle, logEvent, proposeMedia, syncLive } from '@/lib/publications/service'
import { audit, bad, kickWorker, permissions, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ vehicleId: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const { vehicleId } = await ctx.params
  const v = await loadVehicle(a.tenantId, vehicleId)
  if (!v) return bad('Veículo não encontrado nesta loja.', 404)
  const [draft, revisions] = await Promise.all([
    prisma.publicationDraft.findUnique({ where: { vehicleId } }),
    prisma.publicationRevision.findMany({ where: { tenantId: a.tenantId, vehicleId }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, kind: true, number: true, status: true, origin: true, createdAt: true, approvedAt: true, payload: true } }),
  ])
  const facts = factsOf(v)
  const options = Array.isArray(v.siteListing?.options) ? (v.siteListing!.options as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const originals = Array.isArray(v.siteListing?.originalPhotos) ? (v.siteListing!.originalPhotos as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const price = effectivePrice({ salePrice: facts.salePrice ?? null, promoPrice: facts.promoPrice ?? null, isPromo: !!facts.isPromo, promoStartsAt: facts.promoStartsAt ?? null, promoEndsAt: facts.promoEndsAt ?? null })
  return NextResponse.json({
    success: true,
    data: {
      vehicle: { ...facts, title: vehicleTitle(v), stockStatus: v.stockStatus, active: v.active, photosStatus: v.siteListing?.photosStatus ?? 'ORIGEM', price: price.price, oldPrice: price.oldPrice },
      gallery: v.photos.map((p) => p.url), originals, options,
      draft: draft ? { title: draft.title, description: draft.description, conditions: draft.conditions, price: draft.price == null ? null : Number(draft.price), photos: Array.isArray(draft.photos) ? draft.photos : null, mediaRevisionId: draft.mediaRevisionId, approvedAt: draft.approvedAt } : null,
      suggestions: { title: baseTitle(facts), description: autoDescription(facts, options, draft?.conditions ?? '') },
      revisions, can: await permissions(a.user),
    },
  })
}

export async function PUT(req: Request, ctx: Ctx) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const { vehicleId } = await ctx.params
  const v = await loadVehicle(a.tenantId, vehicleId)
  if (!v) return bad('Veículo não encontrado nesta loja.', 404)
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const s = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) || null : null)
  const price = b.price === null || b.price === '' || b.price === undefined ? null : Number(b.price)
  if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 50_000_000)) return bad('Preço inválido.')
  const data = { title: s(b.title, 150), description: s(b.description, 6000), conditions: s(b.conditions, 1000), price: price == null ? null : new Prisma.Decimal(price) }
  try {
    const before = await prisma.publicationDraft.findUnique({ where: { vehicleId } })
    await prisma.publicationDraft.upsert({ where: { vehicleId }, create: { tenantId: a.tenantId, vehicleId, ...data, updatedById: a.user.id }, update: { ...data, updatedById: a.user.id } })
    await logEvent(prisma, { tenantId: a.tenantId, vehicleId, type: 'CONTEUDO', message: 'Conteúdo do anúncio atualizado.', actor: a.actor, data: { antes: before ? { title: before.title, price: before.price, conditions: before.conditions } : null, depois: { title: data.title, price, conditions: data.conditions } } })
    await audit(a, 'UPDATE', 'PublicationDraft', vehicleId, data, before)
    const updates = await syncLive(a.tenantId, vehicleId, a.actor)
    if (updates) kickWorker()
    return NextResponse.json({ success: true, updates })
  } catch (e) {
    return handlePrismaError(e)
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const b = (await req.json().catch(() => ({}))) as { action?: string; photos?: unknown }
  const approve = b.action === 'aprovar'
  const a = await pubAuth(req, approve ? 'marketing.publications.approve' : 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const { vehicleId } = await ctx.params
  const v = await loadVehicle(a.tenantId, vehicleId)
  if (!v) return bad('Veículo não encontrado nesta loja.', 404)
  try {
    if (approve) {
      const photos = Array.isArray(b.photos) ? b.photos.filter((x): x is string => typeof x === 'string').slice(0, 60) : []
      const r = await approveMedia(a.tenantId, vehicleId, photos, a.actor)
      await audit(a, 'APPROVE', 'PublicationMedia', vehicleId, { revisionId: r.revisionId, fotos: photos.length, auto: r.autoPublished.length })
      if (r.autoPublished.length || r.updates) kickWorker()
      return NextResponse.json({ success: true, ...r })
    }
    if (!v.photos.length) return bad('O veículo não tem fotos. Envie as fotos no painel de fotos antes de preparar.')
    const rev = await proposeMedia(a.tenantId, vehicleId, v.photos.map((p) => p.url), 'PAINEL', a.actor)
    await logEvent(prisma, { tenantId: a.tenantId, vehicleId, type: 'PREPARADA', message: `Fotos encaminhadas para a Central (${v.photos.length}).`, actor: a.actor })
    return NextResponse.json({ success: true, revisionId: rev.id, redirect: `/marketing/publicacoes/nova?veiculos=${vehicleId}` })
  } catch (e) {
    if (e instanceof Error && !(e instanceof Prisma.PrismaClientKnownRequestError)) return bad(e.message)
    return handlePrismaError(e)
  }
}
