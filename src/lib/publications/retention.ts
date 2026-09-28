// =============================================================================
// Central de Publicações — retenção (rotina de conferência, 15 min).
//   • Rascunhos (posts avulsos e anúncios nunca enviados) somem após 2 dias.
//   • Posts avulsos enviados ficam só como HISTÓRICO após 2 dias: mídias e
//     texto completo são apagados; ficam data, contas, resultado e links.
//   • Progresso do assistente "Nova publicação" parado há 2 dias é descartado.
// Anúncios de veículos já enviados NÃO são apagados (seguem vivos nos canais).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { deleteVideoParts } from './social/avulsa'
import { sanitizeMedia } from './social/avulsa-core'

import { RETENTION_DAYS } from './retention-core'
export { RETENTION_DAYS, RETENTION_NOTICE } from './retention-core'

export async function applyRetention(now = new Date(), onlyTenantIds?: string[]): Promise<{ rascunhos: number; enviados: number; anuncios: number; progresso: number }> {
  const limit = new Date(now.getTime() - RETENTION_DAYS * 86_400_000)
  const scope = onlyTenantIds ? { tenantId: { in: onlyTenantIds } } : {}

  // Rascunhos de posts avulsos.
  const drafts = await prisma.socialPost.findMany({ where: { ...scope, status: 'RASCUNHO', updatedAt: { lt: limit } }, select: { id: true, tenantId: true, media: true }, take: 500 })
  for (const d of drafts) await deleteVideoParts(d.tenantId, sanitizeMedia(d.media))
  const rascunhos = drafts.length ? (await prisma.socialPost.deleteMany({ where: { id: { in: drafts.map((d) => d.id) } } })).count : 0

  // Posts avulsos encerrados → só histórico.
  const done = await prisma.socialPost.findMany({
    where: { ...scope, status: { in: ['PUBLICADO', 'PARCIAL', 'FALHA', 'CANCELADO'] }, updatedAt: { lt: limit }, NOT: { media: { equals: [] } } },
    select: { id: true, tenantId: true, media: true, caption: true }, take: 500,
  })
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
