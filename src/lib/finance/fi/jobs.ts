// =============================================================================
// F&I — rotina periódica (cron). Nunca reenvia proposta às cegas:
//   1. ENVIANDO travado (processo caiu no meio) → VERIFICANDO.
//   2. VERIFICANDO → consulta o banco (quando a integração permite).
//   3. Aprovação vencida e não escolhida → EXPIRADA.
//   4. Retenção LGPD dos arquivos de documentos.
// Cada item é isolado: falha de um não derruba os outros e fica registrada.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { applyDecision, verifyAttempt, FiError } from './orchestrator'
import { purgeExpiredDocuments } from './documents'

export async function runFiJobs(now = new Date()) {
  const out = { stuck: 0, verified: 0, verifyErrors: 0, expired: 0, purged: 0 }

  const stuck = await prisma.financeProposalSubmission.findMany({ where: { status: 'ENVIANDO', submittedAt: { lt: new Date(now.getTime() - 2 * 60_000) } }, select: { id: true }, take: 100 })
  for (const s of stuck) {
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

  const expiring = await prisma.financeProposalSubmission.findMany({
    where: { active: true, status: { in: ['APROVADA', 'PRE_APROVADA'] }, expiresAt: { lt: now }, proposal: { is: { selectedSubmissionId: null } } },
    select: { id: true }, take: 100,
  })
  for (const s of expiring) {
    try { const r = await applyDecision(s.id, { status: 'EXPIRADA', reason: 'O prazo da aprovação venceu.' }, { source: 'SISTEMA' }); if (r.applied) out.expired++ } catch (e) { console.error('[fi/jobs] expirar', s.id, e instanceof Error ? e.message : e) }
  }

  out.purged = await purgeExpiredDocuments()
  return out
}
