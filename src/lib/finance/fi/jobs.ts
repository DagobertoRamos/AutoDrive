// =============================================================================
// F&I — rotina periódica (cron). Nunca reenvia proposta às cegas:
//   1. ENVIANDO travado (processo caiu no meio) → VERIFICANDO.
//      ENVIANDO na fila por limite do canal (HTTP 429) → reenvia na hora marcada.
//   2. VERIFICANDO → consulta o banco (quando a integração permite).
//   2b. Em análise (enviada/em análise/pendente/pré-aprovada) por API num banco
//       que permite consulta e não avisa por webhook → consulta (a cada 1 h).
//   3. Aprovação vencida e não escolhida → EXPIRADA.
//   4. Retenção LGPD dos arquivos de documentos.
//   5. Site: simulação que falhou num banco conectado é tentada de novo (1 h);
//      ficha do site parada sem envio → aviso para a equipe de F&I.
// Cada item é isolado: falha de um não derruba os outros e fica registrada.
// =============================================================================

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyDecision, dispatchAttempt, verifyAttempt, FiError, type DispatchMeta } from './orchestrator'
import { purgeExpiredDocuments } from './documents'
import { alertStalledSiteSimulations, runSiteAutoSimulation } from './site-auto'
import { readResult } from './site-auto-core'
import { getBankProvider, listBankProviders } from './gateway/registry'

/** Envio parado em ENVIANDO: na fila do limite do canal (aguardar/reenviar) ou travado (verificar). */
export function stuckAction(requestPayload: unknown, now: Date): 'VERIFICAR' | 'AGUARDAR' | 'REENVIAR' {
  const retryAt = (requestPayload as DispatchMeta | null)?.retryAt
  if (!retryAt) return 'VERIFICAR'
  const t = Date.parse(retryAt)
  return Number.isFinite(t) && t > now.getTime() ? 'AGUARDAR' : 'REENVIAR'
}

export async function runFiJobs(now = new Date()) {
  const out = { stuck: 0, requeued: 0, verified: 0, verifyErrors: 0, polled: 0, expired: 0, purged: 0, siteRetried: 0, siteStalledAlerts: 0 }

  const stuck = await prisma.financeProposalSubmission.findMany({ where: { status: 'ENVIANDO', submittedAt: { lt: new Date(now.getTime() - 2 * 60_000) } }, select: { id: true, requestPayload: true }, take: 100 })
  for (const s of stuck) {
    const action = stuckAction(s.requestPayload, now)
    if (action === 'AGUARDAR') continue
    if (action === 'REENVIAR') {
      // Na fila pelo limite do canal: o pedido não chegou ao banco — reenviar é seguro (poucos por rodada).
      if (out.requeued >= 3) continue
      try { await dispatchAttempt(s.id); out.requeued++ } catch (e) { console.error('[fi/jobs] fila', s.id, e instanceof Error ? e.message : e) }
      continue
    }
    try { await applyDecision(s.id, { status: 'VERIFICANDO', reason: 'Verificando resposta do banco.' }, { source: 'SISTEMA' }); out.stuck++ } catch (e) { console.error('[fi/jobs] travada', s.id, e instanceof Error ? e.message : e) }
  }

  const checking = await prisma.financeProposalSubmission.findMany({
    where: { status: 'VERIFICANDO', mode: 'API', OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }] },
    select: { id: true }, take: 50,
  })
  for (const s of checking) {
    try { await verifyAttempt(s.id); out.verified++ } catch (e) {
      out.verifyErrors++
      if (!(e instanceof FiError)) console.error('[fi/jobs] verificar', s.id, e instanceof Error ? e.message : e)
    }
  }

  // Bancos que só informam por consulta (ex.: PAN): sem webhook, a ficha não andaria sozinha.
  const pollKeys = listBankProviders().map((p) => getBankProvider(p.key)).filter((p) => p && p.official && p.capabilities.status && !p.capabilities.webhook).map((p) => p!.key)
  if (pollKeys.length) {
    const inAnalysis = await prisma.financeProposalSubmission.findMany({
      where: {
        active: true, mode: 'API', status: { in: ['ENVIADA', 'EM_ANALISE', 'PENDENTE', 'PRE_APROVADA'] }, externalId: { not: null },
        submittedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 60 * 60_000) } }],
        bankId: { in: (await prisma.financeBank.findMany({ where: { adapterKey: { in: pollKeys } }, select: { id: true } })).map((b) => b.id) },
      },
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } }, select: { id: true }, take: 40,
    })
    for (const s of inAnalysis) {
      try { await verifyAttempt(s.id); out.polled++ } catch (e) {
        out.verifyErrors++
        if (!(e instanceof FiError)) console.error('[fi/jobs] consultar', s.id, e instanceof Error ? e.message : e)
      }
    }
  }

  const expiring = await prisma.financeProposalSubmission.findMany({
    where: { active: true, status: { in: ['APROVADA', 'PRE_APROVADA'] }, expiresAt: { lt: now }, proposal: { is: { selectedSubmissionId: null } } },
    select: { id: true }, take: 100,
  })
  for (const s of expiring) {
    try { const r = await applyDecision(s.id, { status: 'EXPIRADA', reason: 'O prazo da aprovação venceu.' }, { source: 'SISTEMA' }); if (r.applied) out.expired++ } catch (e) { console.error('[fi/jobs] expirar', s.id, e instanceof Error ? e.message : e) }
  }

  out.purged = await purgeExpiredDocuments()

  // Site: banco conectado que falhou na simulação → nova tentativa (no máximo 1 por hora, até 3 dias).
  const retry = await prisma.financeProposal.findMany({
    where: { origin: 'SITE', status: { in: ['SIMULACAO', 'PREENCHENDO'] }, createdAt: { gte: new Date(now.getTime() - 3 * 86_400_000) }, NOT: { simulationResult: { equals: Prisma.AnyNull } } },
    select: { id: true, simulationResult: true }, take: 100,
  }).catch(() => [])
  for (const r of retry) {
    const sim = readResult(r.simulationResult)
    if (!sim || !sim.pending.some((b) => b.reason === 'ERRO') || now.getTime() - Date.parse(sim.at) < 3_600_000) continue
    try { await runSiteAutoSimulation(r.id); out.siteRetried++ } catch (e) { console.error('[fi/jobs] simulação do site', r.id, e instanceof Error ? e.message : e) }
    if (out.siteRetried >= 20) break
  }
  out.siteStalledAlerts = await alertStalledSiteSimulations(now).catch((e) => { console.error('[fi/jobs] alerta de parada', e instanceof Error ? e.message : e); return 0 })
  return out
}
