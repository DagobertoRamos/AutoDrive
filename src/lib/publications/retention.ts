// =============================================================================
// Central de Publicações — retenção (rotina de conferência, 15 min).
//   • Rascunhos (posts avulsos e anúncios nunca enviados) somem após 2 dias.
//   • Posts avulsos PUBLICADOS: fotos e vídeos ficam guardados pelos dias
//     configurados pela loja (padrão 5, para baixar e postar fora); vencido o
//     prazo, mídias e texto completo são apagados e o post sai do painel —
//     fica só no HISTÓRICO (data, contas, resultado e links).
//   • Posts cancelados: o mesmo após 2 dias; com erro (ou parciais): após
//     KEEP_FAILED_DAYS (prazo prometido para "Tentar de novo").
//   • Progresso do assistente "Nova publicação" parado há 2 dias é descartado.
// Anúncios de veículos já enviados NÃO são apagados (seguem vivos nos canais).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { deleteVideoParts, KEEP_FAILED_DAYS } from './social/avulsa'
import { sanitizeMedia } from './social/avulsa-core'

import { RETENTION_DAYS } from './retention-core'
import { loadPublicationSettings } from './settings'
export { RETENTION_DAYS, RETENTION_NOTICE } from './retention-core'

export async function applyRetention(now = new Date(), onlyTenantIds?: string[]): Promise<{ rascunhos: number; enviados: number; anuncios: number; progresso: number }> {
  const limit = new Date(now.getTime() - RETENTION_DAYS * 86_400_000)
  const scope = onlyTenantIds ? { tenantId: { in: onlyTenantIds } } : {}

  // Rascunhos de posts avulsos.
  const drafts = await prisma.socialPost.findMany({ where: { ...scope, status: 'RASCUNHO', updatedAt: { lt: limit } }, select: { id: true, tenantId: true, media: true }, take: 500 })
  for (const d of drafts) await deleteVideoParts(d.tenantId, sanitizeMedia(d.media))
  const rascunhos = drafts.length ? (await prisma.socialPost.deleteMany({ where: { id: { in: drafts.map((d) => d.id) } } })).count : 0

  // Posts avulsos encerrados → só histórico. Publicados: no prazo de guarda da loja.
  const failed = await prisma.socialPost.findMany({
    where: {
      ...scope, NOT: { media: { equals: [] } },
      OR: [{ status: 'CANCELADO', updatedAt: { lt: limit } }, { status: 'FALHA', updatedAt: { lt: new Date(now.getTime() - KEEP_FAILED_DAYS * 86_400_000) } }],
    },
    select: { id: true, tenantId: true, media: true, caption: true }, take: 500,
  })
  const published = await prisma.socialPost.findMany({
    where: { ...scope, status: { in: ['PUBLICADO', 'PARCIAL'] }, publishedAt: { lt: new Date(now.getTime() - 86_400_000) }, NOT: { media: { equals: [] } } },
    select: { id: true, tenantId: true, status: true, media: true, caption: true, publishedAt: true }, take: 500,
  })
  const keepDays = new Map<string, number>()
  for (const t of new Set(published.map((p) => p.tenantId))) keepDays.set(t, (await loadPublicationSettings(t)).posting.mediaKeepDays)
  // Parcial: a rede que falhou ainda pode ser reenviada → guarda pelo menos KEEP_FAILED_DAYS.
  const expired = published.filter((p) => {
    const days = Math.max(keepDays.get(p.tenantId) ?? 5, p.status === 'PARCIAL' ? KEEP_FAILED_DAYS : 0)
    return p.publishedAt && p.publishedAt.getTime() < now.getTime() - days * 86_400_000
  })
  const done = [...failed, ...expired]
  for (const d of done) {
    await deleteVideoParts(d.tenantId, sanitizeMedia(d.media))
    await prisma.socialPost.update({ where: { id: d.id }, data: { media: [], caption: d.caption ? `${d.caption.slice(0, 140)}${d.caption.length > 140 ? '…' : ''}` : null } })
  }

  // Anúncios de veículo salvos como rascunho e nunca enviados.
  const old = await prisma.publication.findMany({ where: { ...scope, status: { in: ['RASCUNHO', 'PRONTO'] }, remoteId: null, pendingToken: null, publishedAt: null, updatedAt: { lt: limit } }, select: { id: true }, take: 500 })
  let anuncios = 0
  if (old.length) {
    const ids = old.map((p) => p.id)
    await prisma.publicationJob.deleteMany({ where: { publicationId: { in: ids } } })
    await prisma.publicationEvent.deleteMany({ where: { publicationId: { in: ids } } })
    anuncios = (await prisma.publication.deleteMany({ where: { id: { in: ids } } })).count
  }

  // Progresso parado do assistente "Nova publicação".
  const progresso = (await prisma.systemSetting.deleteMany({ where: { ...scope, key: { endsWith: ':pubwizard:v1' }, updatedAt: { lt: limit } } }).catch(() => ({ count: 0 }))).count

  return { rascunhos, enviados: done.length, anuncios, progresso }
}
