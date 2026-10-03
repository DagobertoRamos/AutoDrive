// =============================================================================
// POST /api/publications/actions — ações individuais ou EM LOTE, sempre com
// resultado por item. { ids:[...], action, url? }
//   PAUSAR | RETOMAR | RETIRAR | VERIFICAR | SINCRONIZAR | CANCELAR_AGENDAMENTO
//   MANUAL_PUBLICADO (loja confirma que postou; informa o link)
//   MANUAL_REMOVIDO  (loja confirma que removeu à mão)
//   EXCLUIR (nunca publicado: apaga; já publicado: retira do canal)
//   APAGAR_REGISTRO (só o registro na Central; a rede não é tocada)
// Gate: .publish
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { applyIntent, logEvent, type Intent } from '@/lib/publications/service'
import { audit, bad, kickWorker, pubAuth } from '@/lib/publications/api'
import { socialOf } from '@/lib/publications/social/formats'

export const dynamic = 'force-dynamic'
const INTENTS: Intent[] = ['PAUSAR', 'RETOMAR', 'RETIRAR', 'VERIFICAR', 'SINCRONIZAR', 'CANCELAR_AGENDAMENTO', 'REENVIAR']

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.publish')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { ids?: unknown; action?: string; url?: unknown }
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === 'string'))].slice(0, 200) : []
  if (!ids.length) return bad('Selecione ao menos uma publicação.')
  const action = String(b.action ?? '')
  const results: Array<{ id: string; ok: boolean; message: string; status?: string }> = []
  try {
    for (const id of ids) {
      if ((INTENTS as string[]).includes(action)) {
        const r = await applyIntent(a.tenantId, id, action as Intent, a.actor, { reason: 'MANUAL', archive: action === 'RETIRAR' ? 'RETIRADO' : null })
        results.push({ id, ...r })
        continue
      }
      if (action === 'MANUAL_PUBLICADO' || action === 'MANUAL_REMOVIDO') {
        const pub = await prisma.publication.findFirst({ where: { id, tenantId: a.tenantId } })
        if (!pub) { results.push({ id, ok: false, message: 'Publicação não encontrada.' }); continue }
        const url = typeof b.url === 'string' && /^https:\/\/[^\s]{4,500}$/.test(b.url.trim()) ? b.url.trim() : null
        if (action === 'MANUAL_PUBLICADO' && !url) { results.push({ id, ok: false, message: 'Cole o link (https://…) do post publicado.' }); continue }
        const now = new Date()
        const status = action === 'MANUAL_PUBLICADO' ? 'PUBLICADO' : 'REMOVIDO'
        await prisma.publication.update({
          where: { id },
          data: action === 'MANUAL_PUBLICADO'
            ? { status, confirmedState: 'PUBLICADO', remoteUrl: url, manualAction: null, lastVerifiedAt: now, publishedAt: pub.publishedAt ?? now, remoteStatus: 'confirmado pela loja' }
            : { status, confirmedState: 'REMOVIDO', desiredState: 'REMOVIDO', manualAction: null, lastVerifiedAt: now, removedAt: now, ...(pub.archiveReason ? { archivedAt: now } : {}), remoteStatus: 'removido pela loja' },
        })
        await logEvent(prisma, { tenantId: a.tenantId, publicationId: id, vehicleId: pub.vehicleId, channel: pub.channel, type: action, message: action === 'MANUAL_PUBLICADO' ? `Publicação manual confirmada pela loja: ${url}` : 'Remoção manual confirmada pela loja.', fromStatus: pub.status, toStatus: status, actor: a.actor })
        results.push({ id, ok: true, message: 'Registrado.', status })
        continue
      }
      if (action === 'APAGAR_REGISTRO') {
        // "Começar do zero": apaga o registro da Central (e a fila) SEM mexer na rede —
        // para posts que a loja já apagou (ou vai apagar) no próprio Instagram/Facebook.
        const pub = await prisma.publication.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true } })
        if (!pub) { results.push({ id, ok: false, message: 'Publicação não encontrada.' }); continue }
        await prisma.$transaction([
          prisma.publicationJob.deleteMany({ where: { publicationId: id } }),
          prisma.publicationEvent.deleteMany({ where: { publicationId: id } }),
          prisma.publication.delete({ where: { id } }),
        ])
        results.push({ id, ok: true, message: 'Registro apagado da Central.' })
        continue
      }
      if (action === 'EXCLUIR') {
        // Nunca foi ao ar: apaga. Já publicado: retira do canal (fica no histórico).
        const pub = await prisma.publication.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true, status: true, remoteId: true, publishedAt: true, pendingToken: true, desiredState: true, overrides: true } })
        if (!pub) { results.push({ id, ok: false, message: 'Publicação não encontrada.' }); continue }
        // Story some sozinho da rede em até 24 h: não há o que retirar, só apaga o registro.
        const story = socialOf(pub.overrides)?.format === 'STORY'
        // Já pediram para retirar e a remoção não concluiu (ficava "Publicando" para
        // sempre e o Excluir respondia "nada a mudar"): o 2º Excluir apaga o registro.
        const removalStuck = pub.desiredState === 'REMOVIDO' || pub.status === 'REMOCAO_PENDENTE'
        if (!story && !removalStuck && (pub.remoteId || pub.publishedAt || pub.pendingToken) && pub.status !== 'REMOVIDO') {
          const r = await applyIntent(a.tenantId, id, 'RETIRAR', a.actor, { reason: 'MANUAL', archive: 'RETIRADO' })
          results.push({ id, ...r, message: r.ok ? 'Já estava no ar: retirando do canal.' : r.message })
          continue
        }
        await prisma.$transaction([
          prisma.publicationJob.deleteMany({ where: { publicationId: id } }),
          prisma.publicationEvent.deleteMany({ where: { publicationId: id } }),
          prisma.publication.delete({ where: { id } }),
        ])
        results.push({ id, ok: true, message: story ? 'Excluído. O Story some sozinho da rede em até 24 h.' : removalStuck ? 'Registro apagado. Se ainda aparecer na rede, apague por lá.' : 'Excluído.' })
        continue
      }
      results.push({ id, ok: false, message: 'Ação desconhecida.' })
    }
    await audit(a, `PUBLICATION_${action}`, 'Publication', ids.length === 1 ? ids[0] : null, { ids, results })
    if (results.some((r) => r.ok)) kickWorker()
    const ok = results.filter((r) => r.ok).length
    return NextResponse.json({ success: true, results, summary: `${ok} de ${results.length} com sucesso` })
  } catch (e) {
    return handlePrismaError(e)
  }
}
