// =============================================================================
// Reconciliação periódica (cron). Rede de segurança além dos ganchos:
//   1. estoque × anúncios: vendido/retirado com anúncio no ar → retira;
//      venda cancelada → reativa (conforme regra da loja);
//   2. anúncios publicados sem conferência há 12 h → VERIFICAR no canal;
//   3. "em análise" sem tarefa → VERIFICAR;
//   4. conteúdo mudou no estoque (preço, fotos, descrição) → ATUALIZAR;
//   5. pedido de publicação travado por pendência (ex.: fotos não aprovadas)
//      → tenta de novo sozinho quando a pendência some;
//   0. saúde das contas: token vencido → RECONECTAR + aviso aos gestores.
// Tudo por loja; limitado por execução para não estourar tempo nem cotas.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createPublications, enqueue, onVehicleStockChanged, syncLive, SYSTEM_ACTOR } from './service'
import { checkConnectionHealth } from './health'
import { PUBLISHABLE_STOCK } from './sale-rules-core'

export async function reconcile(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 200
  const out = { stockDrift: 0, verify: 0, stuck: 0, sync: 0, retried: 0, expired: 0, expiring: 0 }

  // 0) Contas com acesso vencido/vencendo (antes de qualquer envio falhar).
  const h = await checkConnectionHealth().catch((e) => { console.error('[publications] saúde das contas', e); return { expired: 0, expiring: 0 } })
  out.expired = h.expired; out.expiring = h.expiring

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

  // 5) Pedido de publicar que ficou em rascunho por pendência (lastError
  //    preenchido — rascunho salvo de propósito não tem erro). Revalida; se a
  //    pendência sumiu, entra na fila; senão continua como está.
  const held = await prisma.publication.findMany({
    where: { archivedAt: null, status: 'RASCUNHO', desiredState: 'PUBLICADO', remoteId: null, lastError: { not: null }, connection: { status: 'CONECTADO' }, jobs: { none: { status: { in: ['PENDENTE', 'EXECUTANDO'] } } }, updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    select: { tenantId: true, vehicleId: true, connectionId: true, campaignKey: true }, take: limit,
  })
  for (const p of held) {
    if (!p.connectionId) continue
    const [r] = await createPublications(p.tenantId, [{ vehicleId: p.vehicleId, connectionId: p.connectionId, campaignKey: p.campaignKey }], { mode: 'AGORA', actor: SYSTEM_ACTOR }).catch(() => [])
    if (r?.status === 'ENFILEIRADO') out.retried++
    // Continua travado: marca a revalidação para não repetir antes de 10 min.
    else await prisma.publication.updateMany({ where: { tenantId: p.tenantId, vehicleId: p.vehicleId, connectionId: p.connectionId, campaignKey: p.campaignKey }, data: { updatedAt: new Date() } })
  }

  return out
}
