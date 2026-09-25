// GET /api/publications/[id]/export — publicação MANUAL (Marketplace, grupos,
// perfis): ZIP com as fotos (JPEG, na ordem, capa = 01) e o texto pronto.
// A loja posta à mão e depois confirma com o link.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { channelSpec } from '@/lib/publications/channels'
import { channelText } from '@/lib/publications/content-core'
import { renderVariant } from '@/lib/publications/media'
import { buildFor, loadVehicle, logEvent } from '@/lib/publications/service'
import { bad, pubAuth } from '@/lib/publications/api'
import { buildZip } from '@/lib/publications/zip'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  const pub = await prisma.publication.findFirst({ where: { id, tenantId: a.tenantId } })
  if (!pub) return bad('Publicação não encontrada.', 404)
  const v = await loadVehicle(a.tenantId, pub.vehicleId)
  const spec = channelSpec(pub.channel)
  if (!v || !spec) return bad('Veículo não encontrado.', 404)
  const p = await buildFor(a.tenantId, v, pub.externalRef, pub.overrides)
  const entries = []
  const photos = p.photos.slice(0, spec.media.max)
  for (let i = 0; i < photos.length; i++) {
    const m = /\/api\/site\/assets\/([a-z0-9]{10,40})/i.exec(photos[i])
    try {
      entries.push({ name: `${String(i + 1).padStart(2, '0')}${i === 0 ? '-capa' : ''}.jpg`, data: await renderVariant(m ? { t: a.tenantId, a: m[1], w: 1920 } : { t: a.tenantId, u: photos[i], w: 1920 }) })
    } catch { /* foto inacessível: segue com as demais */ }
  }
  entries.push({ name: 'texto.txt', data: Buffer.from(`${channelText(p, spec).description}\n`, 'utf8') })
  await logEvent(prisma, { tenantId: a.tenantId, publicationId: id, vehicleId: pub.vehicleId, channel: pub.channel, type: 'EXPORTADA', message: `Fotos (${entries.length - 1}) e texto exportados para postagem manual.`, actor: a.actor })
  const slug = `${v.brand ?? ''}-${v.model ?? ''}-${v.plate ?? v.id}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return new NextResponse(new Uint8Array(buildZip(entries)), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="anuncio-${slug || 'veiculo'}.zip"`, 'Cache-Control': 'no-store' },
  })
}
