// =============================================================================
// /api/publications/mappings — de-para estoque → códigos dos portais.
//   GET  ?status=REVISAR (padrão) | todos
//   PUT  { id, targetId, targetLabel } → CONFIRMADO (quem confirmou fica
//        registrado) e reenvia as publicações que falharam por mapeamento.
// Gate: ver = marketing.publications; confirmar = .approve
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { channelSpec } from '@/lib/publications/channels'
import { enqueue, logEvent } from '@/lib/publications/service'
import { audit, bad, kickWorker, permissions, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'
const KIND_LABEL: Record<string, string> = { BRAND: 'Marca', MODEL: 'Modelo', VERSION: 'Versão', COLOR: 'Cor', FUEL: 'Combustível', TRANSMISSION: 'Câmbio' }

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const all = new URL(req.url).searchParams.get('status') === 'todos'
  const rows = await prisma.publicationMapping.findMany({ where: { tenantId: a.tenantId, ...(all ? {} : { status: 'REVISAR' }) }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: 300 })
  return NextResponse.json({ success: true, data: rows.map((r) => ({ ...r, channelName: channelSpec(r.channel)?.name ?? r.channel, kindLabel: KIND_LABEL[r.kind] ?? r.kind })), can: await permissions(a.user) })
}

export async function PUT(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.approve')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { id?: string; targetId?: string; targetLabel?: string }
  const row = await prisma.publicationMapping.findFirst({ where: { id: String(b.id ?? ''), tenantId: a.tenantId } })
  if (!row) return bad('Mapeamento não encontrado.', 404)
  const targetId = String(b.targetId ?? '').trim()
  if (!targetId) return bad('Escolha o código correspondente no portal.')
  try {
    await prisma.publicationMapping.update({ where: { id: row.id }, data: { targetId, targetLabel: String(b.targetLabel ?? '').slice(0, 200) || targetId, status: 'CONFIRMADO', confirmedById: a.user.id } })
    // Reenvia o que falhou por mapeamento neste canal.
    const failed = await prisma.publication.findMany({ where: { tenantId: a.tenantId, channel: row.channel, lastErrorCode: 'MAPPING', archivedAt: null, desiredState: 'PUBLICADO' } })
    for (const p of failed) {
      await prisma.$transaction(async (tx) => {
        const r = await enqueue(tx, p, p.remoteId ? 'ATUALIZAR' : 'PUBLICAR', { actorId: a.user.id })
        if (r.created) await tx.publication.update({ where: { id: p.id }, data: { status: 'NA_FILA', lastError: null, lastErrorCode: null, lastErrorHint: null } })
      })
    }
    await logEvent(prisma, { tenantId: a.tenantId, channel: row.channel, type: 'MAPEAMENTO', message: `${KIND_LABEL[row.kind] ?? row.kind} "${row.sourceLabel}" → "${b.targetLabel ?? targetId}" confirmado.`, actor: a.actor })
    await audit(a, 'UPDATE', 'PublicationMapping', row.id, { targetId, targetLabel: b.targetLabel }, { targetId: row.targetId, targetLabel: row.targetLabel })
    if (failed.length) kickWorker()
    return NextResponse.json({ success: true, requeued: failed.length })
  } catch (e) {
    return handlePrismaError(e)
  }
}
