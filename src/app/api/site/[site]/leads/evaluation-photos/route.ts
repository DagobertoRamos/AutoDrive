// =============================================================================
// POST /api/site/[site]/leads/evaluation-photos — fotos do passo a passo da
// pré-avaliação ("Venda seu carro"). multipart: token, step, shot, file (uma
// por requisição). Só com o token assinado que a resposta do lead devolveu
// (30 min). Cada foto vira anexo da avaliação na seção/item da etapa; a foto
// de avaria vai para o item marcado com a avaria. Reenvio da mesma foto não
// duplica. Valida o conteúdo (JPG/PNG/WebP de verdade).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSite } from '@/lib/site/config'
import { sniffImage } from '@/lib/site/assets-core'
import { verifyEvalPhotoToken } from '@/lib/site/lead-photo-token'
import { saveAttachment } from '@/lib/evaluation/storage'
import { findShot, PRE_EVAL_MAX_PHOTOS, shotFileName, SITE_PRE_EVAL_SOURCE } from '@/lib/evaluation/site-pre-evaluation'

export const runtime = 'nodejs'

const MAX_BYTES = 3 * 1024 * 1024
const hits = new Map<string, number[]>()
function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > PRE_EVAL_MAX_PHOTOS * 2
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
  const evaluationId = verifyEvalPhotoToken(String(form?.get('token') ?? ''), tenantId)
  if (!evaluationId) return fail('O prazo para enviar fotos terminou. Mande pelo WhatsApp.', 403)
  const stepKey = String(form?.get('step') ?? '')
  const shotKey = String(form?.get('shot') ?? '')
  const target = findShot(stepKey, shotKey)
  if (!target) return fail('Etapa de foto inválida.', 400)
  const file = form?.get('file')
  if (!(file instanceof Blob)) return fail('Foto não enviada.', 400)
  if (file.size > MAX_BYTES) return fail('Foto muito grande.', 413)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = sniffImage(bytes)
  if (!info) return fail('Envie a foto em JPG, PNG ou WebP.', 415)

  try {
    const ev = await prisma.vehicleEvaluation.findFirst({ where: { id: evaluationId, tenantId }, select: { id: true, lookupSource: true } })
    if (!ev || ev.lookupSource !== SITE_PRE_EVAL_SOURCE) return fail('Avaliação não encontrada.', 404)
    const fileName = shotFileName(stepKey, shotKey)
    const [dup, count] = await Promise.all([
      prisma.evaluationAttachment.findFirst({ where: { evaluationId, fileName }, select: { id: true } }),
      prisma.evaluationAttachment.count({ where: { evaluationId, uploadedById: null } }),
    ])
    if (dup) return NextResponse.json({ success: true, duplicate: true })
    if (count >= PRE_EVAL_MAX_PHOTOS) return fail(`Limite de ${PRE_EVAL_MAX_PHOTOS} fotos atingido.`, 409)

    const item = target.catalogKey
      ? await prisma.evaluationItem.findFirst({ where: { evaluationId, catalogKey: target.catalogKey }, select: { id: true } })
      : null
    const saved = await saveAttachment(evaluationId, fileName, info.mime, Buffer.from(bytes))
    await prisma.evaluationAttachment.create({
      data: {
        tenantId, evaluationId, itemId: item?.id ?? null, section: target.step.section, category: 'FOTO',
        fileName: saved.fileName, fileType: saved.fileType, mimeType: saved.mimeType, fileSize: saved.fileSize,
        storageKey: saved.storageKey, publicUrl: saved.publicUrl, uploadedById: null, uploadedByName: `Cliente (site) — ${target.label}`,
      },
    })
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('[site/evaluation-photos]', err)
    return fail('Não foi possível enviar a foto.', 500)
  }
}
