// =============================================================================
// POST /api/site/[site]/leads/photos — o cliente envia as fotos do carro logo
// depois da pré-avaliação ("Venda seu carro"). multipart: token, file (uma por
// requisição). Só com o token assinado que a própria resposta do lead devolveu
// (30 min, até 10 fotos). Valida o conteúdo; guarda como LEAD_PHOTO (não é
// pública: só a equipe da loja vê, no CRM).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSite } from '@/lib/site/config'
import { ImageRejected, storeTenantImage } from '@/lib/site/assets'
import { LEAD_PHOTO_MAX, verifyLeadPhotoToken } from '@/lib/site/lead-photo-token'

export const runtime = 'nodejs'

const MAX_BYTES = 3 * 1024 * 1024
const hits = new Map<string, number[]>()
function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > 30
}

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status })

export async function POST(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const resolved = await resolveSite(site)
  if (!resolved) return fail('Site não encontrado.', 404)
  const { tenantId } = resolved
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  if (rateLimited(`${tenantId}:${ip}`)) return fail('Muitos envios em pouco tempo. Mande as fotos pelo WhatsApp.', 429)

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const leadId = verifyLeadPhotoToken(String(form?.get('token') ?? ''), tenantId)
  if (!leadId) return fail('O prazo para enviar fotos terminou. Mande pelo WhatsApp.', 403)
  if (!(file instanceof Blob)) return fail('Foto não enviada.', 400)
  if (file.size > MAX_BYTES) return fail('Foto muito grande.', 413)

  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id: leadId, tenantId }, select: { id: true, metadata: true } })
    if (!lead) return fail('Solicitação não encontrada.', 404)
    const meta = (lead.metadata && typeof lead.metadata === 'object' ? lead.metadata : {}) as Record<string, unknown>
    const photos = Array.isArray(meta.sitePhotos) ? (meta.sitePhotos as string[]) : []
    if (photos.length >= LEAD_PHOTO_MAX) return fail(`Limite de ${LEAD_PHOTO_MAX} fotos atingido.`, 409)

    const saved = await storeTenantImage(tenantId, 'LEAD_PHOTO', new Uint8Array(await file.arrayBuffer()))
    await prisma.marketingLead.update({ where: { id: lead.id }, data: { metadata: { ...meta, sitePhotos: [...photos, saved.id] } } })
    if (photos.length === 0) {
      await prisma.crmLeadInteraction.create({
        data: { tenantId, leadId: lead.id, type: 'NOTE', channel: 'SITE', summary: 'O cliente enviou fotos do carro pelo site (veja em "Fotos enviadas pelo cliente", no Resumo).', authorId: 'site', authorName: 'Site da loja', occurredAt: new Date() },
      }).catch(() => {})
    }
    return NextResponse.json({ success: true, count: photos.length + 1 }, { status: 201 })
  } catch (err) {
    if (err instanceof ImageRejected) return fail(err.message, 415)
    console.error('[site/lead-photos]', err)
    return fail('Não foi possível enviar a foto.', 500)
  }
}
