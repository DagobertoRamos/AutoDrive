// =============================================================================
// marketing/distribution.ts — motor de distribuição de leads da Mesa SDR.
// Consome MarketingLeadDistributionPolicy (modo + config) e os membros da mesa
// (presença, carga, unidade) para atribuir leads automaticamente.
//
// Modos automáticos: ROUND_ROBIN (roleta), LOAD_BALANCED (menor carga),
// PERFORMANCE_WEIGHTED (peso), PRIORITY_RULES (regras → time/unidade).
// SHARK_TANK e MANUAL NÃO auto-atribuem (ficam para "assumir"/manual).
//
// Elegibilidade: ativo + presença elegível + abaixo do limite de leads abertos
// + unidade compatível. SLA: cria MarketingLeadSla + slaDeadline no assignment.
// Os seletores são puros (testáveis); o acesso ao banco fica isolado abaixo.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notifyByRole } from '@/services/notification.service'
import type { LeadDistributionMode, Prisma } from '@prisma/client'

const AUTO_MODES: LeadDistributionMode[] = ['ROUND_ROBIN', 'LOAD_BALANCED', 'PERFORMANCE_WEIGHTED', 'PRIORITY_RULES']
// Papéis de gestão avisados quando o SLA estoura.
const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']
const OPEN_STATUSES = ['ASSIGNED', 'WORKING', 'QUALIFIED'] as const
const DEFAULT_SLA_SECONDS = 1800 // 30 min
const DEFAULT_ELIGIBLE_PRESENCE = ['ONLINE']

// ── Seletores puros (testáveis) ──────────────────────────────────────────────
export interface Candidate {
  memberId: string
  userId: string
  teamId: string
  weight: number
  openLeads: number
  maxOpenLeads: number | null
  lastAssignedAt: number | null // epoch ms
  unitId: string | null
  presence: string
}

export function eligibleCandidates(cands: Candidate[], leadUnitId: string | null | undefined, eligiblePresence: string[]): Candidate[] {
  return cands.filter((c) =>
    eligiblePresence.includes(c.presence) &&
    (c.maxOpenLeads == null || c.openLeads < c.maxOpenLeads) &&
    (!leadUnitId || !c.unitId || c.unitId === leadUnitId),
  )
}

/** Escolhe 1 candidato conforme o modo. Assume `cands` já filtrados por elegibilidade. */
export function pickCandidate(cands: Candidate[], mode: LeadDistributionMode): Candidate | null {
  if (cands.length === 0) return null
  const byRecency = (a: Candidate, b: Candidate) => (a.lastAssignedAt ?? 0) - (b.lastAssignedAt ?? 0) || a.openLeads - b.openLeads
  const list = cands.slice()
  switch (mode) {
    case 'LOAD_BALANCED':
      return list.sort((a, b) => a.openLeads - b.openLeads || byRecency(a, b))[0]
    case 'PERFORMANCE_WEIGHTED':
      return list.sort((a, b) => (b.weight || 1) - (a.weight || 1) || a.openLeads - b.openLeads || byRecency(a, b))[0]
    case 'ROUND_ROBIN':
    case 'PRIORITY_RULES':
    default:
      // Roleta: o que está há mais tempo sem receber (lastAssignedAt mais antigo).
      return list.sort(byRecency)[0]
  }
}

// ── Acesso ao banco ──────────────────────────────────────────────────────────
async function getActivePolicy(tenantId: string) {
  return prisma.marketingLeadDistributionPolicy.findFirst({
    where: { tenantId, active: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })
}

function cfgOf(policy: { config: Prisma.JsonValue | null }): Record<string, unknown> {
  return (policy.config && typeof policy.config === 'object' && !Array.isArray(policy.config) ? policy.config : {}) as Record<string, unknown>
}

async function loadCandidates(tenantId: string, teamId: string | null): Promise<Candidate[]> {
  const members = await prisma.marketingSdrMember.findMany({
    where: { tenantId, active: true, ...(teamId ? { teamId } : {}) },
  })
  if (members.length === 0) return []
  const counts = await prisma.marketingLead.groupBy({
    by: ['assignedToUserId'],
    where: { tenantId, assignedToUserId: { in: members.map((m) => m.userId) }, status: { in: OPEN_STATUSES as unknown as never } },
    _count: { _all: true },
  })
  const openBy = new Map<string, number>()
  for (const c of counts) if (c.assignedToUserId) openBy.set(c.assignedToUserId, c._count._all)
  return members.map((m) => ({
    memberId: m.id, userId: m.userId, teamId: m.teamId,
    weight: m.weight == null ? 1 : Number(m.weight),
    openLeads: openBy.get(m.userId) ?? 0,
    maxOpenLeads: m.maxOpenLeads ?? null,
    lastAssignedAt: m.lastAssignedAt ? m.lastAssignedAt.getTime() : null,
    unitId: m.unitId, presence: m.presence,
  }))
}

async function assign(tenantId: string, leadId: string, cand: Candidate, mode: LeadDistributionMode, slaSeconds: number) {
  const now = new Date()
  const deadline = new Date(now.getTime() + slaSeconds * 1000)
  await prisma.$transaction(async (tx) => {
    await tx.marketingLead.update({
      where: { id: leadId },
      data: { assignedToUserId: cand.userId, claimedByUserId: cand.userId, claimedAt: now, teamId: cand.teamId, status: 'ASSIGNED' },
    })
    await tx.marketingSdrMember.update({ where: { id: cand.memberId }, data: { lastAssignedAt: now } })
    await tx.marketingLeadAssignment.create({
      data: { tenantId, leadId, assignedToUserId: cand.userId, teamId: cand.teamId, mode, status: 'ASSIGNED', slaDeadline: deadline },
    })
    await tx.marketingLeadSla.create({ data: { tenantId, leadId, slaSeconds, startedAt: now, deadline, status: 'PENDING' } })
  })
}

export interface DistributeResult { mode: LeadDistributionMode | null; scanned: number; assigned: number; skipped: number; note?: string }

/** Distribui leads pendentes (NEW/RECYCLED, sem responsável) do tenant. */
export async function distributePendingLeads(tenantId: string, limit = 50): Promise<DistributeResult> {
  const policy = await getActivePolicy(tenantId)
  if (!policy) return { mode: null, scanned: 0, assigned: 0, skipped: 0, note: 'Nenhuma política ativa.' }
  if (!AUTO_MODES.includes(policy.mode)) return { mode: policy.mode, scanned: 0, assigned: 0, skipped: 0, note: 'Modo não-automático (tanque/manual).' }

  const cfg = cfgOf(policy)
  const slaSeconds = Number(cfg.slaSeconds) > 0 ? Number(cfg.slaSeconds) : DEFAULT_SLA_SECONDS
  const eligiblePresence = Array.isArray(cfg.eligiblePresence) && cfg.eligiblePresence.length ? (cfg.eligiblePresence as string[]) : DEFAULT_ELIGIBLE_PRESENCE

  const leads = await prisma.marketingLead.findMany({
    where: { tenantId, assignedToUserId: null, claimedByUserId: null, status: { in: ['NEW', 'RECYCLED'] } },
    orderBy: { createdAt: 'asc' }, take: Math.min(Math.max(limit, 1), 500),
    select: { id: true, unitId: true },
  })

  let assigned = 0, skipped = 0
  for (const lead of leads) {
    // Recarrega candidatos por lead (a carga muda a cada atribuição).
    const cands = await loadCandidates(tenantId, policy.teamId)
    const elig = eligibleCandidates(cands, lead.unitId, eligiblePresence)
    const pick = pickCandidate(elig, policy.mode)
    if (!pick) { skipped++; continue }
    await assign(tenantId, lead.id, pick, policy.mode, slaSeconds)
    assigned++
  }
  return { mode: policy.mode, scanned: leads.length, assigned, skipped }
}

/** Distribui UM lead específico (usado logo após a criação). Best-effort. */
export async function distributeLeadById(tenantId: string, leadId: string): Promise<boolean> {
  const policy = await getActivePolicy(tenantId)
  if (!policy || !AUTO_MODES.includes(policy.mode)) return false
  const lead = await prisma.marketingLead.findFirst({
    where: { id: leadId, tenantId, assignedToUserId: null, claimedByUserId: null, status: { in: ['NEW', 'RECYCLED'] } },
    select: { id: true, unitId: true },
  })
  if (!lead) return false
  const cfg = cfgOf(policy)
  const slaSeconds = Number(cfg.slaSeconds) > 0 ? Number(cfg.slaSeconds) : DEFAULT_SLA_SECONDS
  const eligiblePresence = Array.isArray(cfg.eligiblePresence) && cfg.eligiblePresence.length ? (cfg.eligiblePresence as string[]) : DEFAULT_ELIGIBLE_PRESENCE
  const elig = eligibleCandidates(await loadCandidates(tenantId, policy.teamId), lead.unitId, eligiblePresence)
  const pick = pickCandidate(elig, policy.mode)
  if (!pick) return false
  await assign(tenantId, lead.id, pick, policy.mode, slaSeconds)
  return true
}

export interface SlaResult { scanned: number; breached: number; recycled: number }

/** Processa SLAs estourados: marca BREACHED e devolve o lead para nova distribuição. */
export async function processSlaBreaches(tenantId: string, limit = 100): Promise<SlaResult> {
  const now = new Date()
  const breaches = await prisma.marketingLeadSla.findMany({
    where: { tenantId, status: 'PENDING', deadline: { lt: now } },
    orderBy: { deadline: 'asc' }, take: Math.min(Math.max(limit, 1), 500),
    select: { id: true, leadId: true },
  })
  let recycled = 0
  for (const b of breaches) {
    const lead = await prisma.marketingLead.findUnique({ where: { id: b.leadId }, select: { id: true, status: true, assignedToUserId: true, lastContactAt: true } })
    await prisma.$transaction(async (tx) => {
      await tx.marketingLeadSla.update({ where: { id: b.id }, data: { status: 'BREACHED', breachedAt: now } })
      // Se ainda não foi trabalhado (sem contato) e segue atribuído → devolve p/ a fila.
      if (lead && lead.status === 'ASSIGNED' && !lead.lastContactAt) {
        await tx.marketingLead.update({ where: { id: lead.id }, data: { assignedToUserId: null, claimedByUserId: null, claimedAt: null, status: 'RECYCLED' } })
        await tx.marketingLeadAssignment.create({
          data: { tenantId, leadId: lead.id, assignedToUserId: lead.assignedToUserId, mode: 'ROUND_ROBIN', status: 'REDISTRIBUTED', reason: 'SLA estourado', respondedAt: now },
        })
        recycled++
      }
    })
  }
  // Avisa os gestores (best-effort, agregado) quando houve estouro de SLA.
  if (breaches.length > 0) {
    await notifyByRole({
      tenantId,
      roles: MANAGER_ROLES,
      type: 'WARNING',
      title: 'SLA de atendimento estourado',
      message: `${breaches.length} lead(s) sem atendimento dentro do SLA${recycled > 0 ? ` — ${recycled} devolvido(s) à fila para redistribuição` : ''}.`,
      actionUrl: '/marketing/sdr/inbox',
      metadata: { kind: 'sla_breach', breached: breaches.length, recycled },
      channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
    }).catch(() => {})
  }

  // Após reciclar, tenta redistribuir os que voltaram à fila.
  if (recycled > 0) await distributePendingLeads(tenantId, recycled)
  return { scanned: breaches.length, breached: breaches.length, recycled }
}
