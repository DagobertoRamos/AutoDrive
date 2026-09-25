// =============================================================================
// Reconciliação periódica (cron). Rede de segurança além dos ganchos:
//   1. estoque × anúncios: vendido/retirado com anúncio no ar → retira;
//      venda cancelada → reativa (conforme regra da loja);
//   2. anúncios publicados sem conferência há 12 h → VERIFICAR no canal;
//   3. "em análise" sem tarefa → VERIFICAR;
//   4. conteúdo mudou no estoque (preço, fotos, descrição) → ATUALIZAR.
// Tudo por loja; limitado por execução para não estourar tempo nem cotas.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { enqueue, onVehicleStockChanged, syncLive, SYSTEM_ACTOR } from './service'
import { PUBLISHABLE_STOCK } from './sale-rules-core'

export async function reconcile(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 200
  const out = { stockDrift: 0, verify: 0, stuck: 0, sync: 0 }

  // 1) Anúncio ativo/pausado cujo veículo saiu do estoque vendável ou voltou.
  const drift = await prisma.publication.findMany({
    where: {
      archivedAt: null,
      OR: [
        { desiredState: { in: ['PUBLICADO', 'PAUSADO'] }, vehicle: { OR: [{ active: false }, { stockStatus: { notIn: [...PUBLISHABLE_STOCK] } }] } },
        { pausedReason: 'VENDA_EM_ANDAMENTO', desiredState: { in: ['PAUSADO', 'REMOVIDO'] }, vehicle: { active: true, stockStatus: { in: [...PUBLISHABLE_STOCK] } } },
      ],
    },
    select: { tenantId: true, vehicleId: true }, distinct: ['vehicleId'], take: limit,
  })
  for (const d of drift) {
    const r = await onVehicleStockChanged(d.tenantId, d.vehicleId, SYSTEM_ACTOR).catch(() => ({ affected: 0 }))
    out.stockDrift += r.affected
  }

  // 2) Conferência periódica do que está publicado.
  const stale = await prisma.publication.findMany({
    where: { archivedAt: null, confirmedState: { in: ['PUBLICADO', 'PAUSADO'] }, OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: new Date(Date.now() - 12 * 3_600_000) } }], channel: { not: 'MANUAL_SOCIAL' } },
    take: limit,
  })
  for (const p of stale) {
    const r = await prisma.$transaction((tx) => enqueue(tx, p, 'VERIFICAR'))
    if (r.created) out.verify++
  }

  // 3) "Em análise"/pendente sem nenhuma tarefa viva.
  const stuck = await prisma.publication.findMany({
    where: { archivedAt: null, status: { in: ['EM_ANALISE', 'NA_FILA', 'ENVIANDO', 'ATUALIZACAO_PENDENTE', 'REMOCAO_PENDENTE'] }, jobs: { none: { status: { in: ['PENDENTE', 'EXECUTANDO'] } } }, updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    take: limit,
  })
  for (const p of stuck) {
    const op = p.status === 'REMOCAO_PENDENTE' ? 'REMOVER' : p.remoteId || p.pendingToken ? 'VERIFICAR' : 'PUBLICAR'
    const r = await prisma.$transaction((tx) => enqueue(tx, p, op))
    if (r.created) out.stuck++
  }

  // 4) Conteúdo mudou (preço/fotos/descrição) desde o último envio.
  const live = await prisma.publication.findMany({ where: { archivedAt: null, desiredState: 'PUBLICADO', confirmedState: 'PUBLICADO' }, select: { tenantId: true, vehicleId: true }, distinct: ['vehicleId'], take: limit })
  for (const l of live) out.sync += await syncLive(l.tenantId, l.vehicleId, SYSTEM_ACTOR).catch(() => 0)

  return out
}
