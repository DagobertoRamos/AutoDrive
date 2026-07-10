// =============================================================================
// nagging-sweep.ts — motor server-side da Crítica (Fase 4 + 5). Roda no cron:
//   1) Eleva pendências a CRÍTICA quando os gatilhos batem (2x prazo estourado
//      ou Urgente sem resposta há X h) — registra evento e avisa o responsável.
//   2) Nível 2 (em Crítica há N h): push periódico ao responsável.
//   3) Nível 3 (em Crítica há mais N h): escala p/ gestão + aplica PENALIDADE
//      (que SÓ AVISA/marca — não mexe na fila de leads). Tudo idempotente.
// Tolerante a migration pendente (pendency_events/pendency_penalties): se as
// tabelas não existem, o motor simplesmente não age.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { sendToTokens } from '@/lib/push/fcm'
import { sendWebPushToUser } from '@/lib/push/web-push'
import { loadTenantPendencySettings, DEFAULT_PENDENCY_SETTINGS, type PendencySlaEngineSettings } from './settings'
import { logPendencyEvent, PENDENCY_EVENT } from './events'
import { criticalSince, criticalLevel, shouldBecomeCritical, type NaggingEventLite } from './nagging'
import type { PendencyStatus } from '@prisma/client'

// Ciclo NÃO age em AGUARDANDO_RESPOSTA (resolvido, em validação) nem encerradas.
const OPEN: PendencyStatus[] = ['ABERTA', 'EM_ANDAMENTO', 'REATIVADA', 'VENCIDA']

export interface NaggingRunResult { scanned: number; raised: number; pushed: number; escalated: number; penalized: number }

type Candidate = {
  id: string; tenantId: string | null; unitId: string; responsibleId: string; managerId: string | null
  customerName: string; plate: string | null; type: string | null
  priority: string; severity: string | null; status: string; escalatedAt: Date | null
}

/** responsibleId pode ser Seller.id (mapeia p/ userId) ou já um User.id. */
async function responsibleUserId(responsibleId: string): Promise<string | null> {
  const s = await prisma.seller.findUnique({ where: { id: responsibleId }, select: { userId: true } }).catch(() => null)
  if (s?.userId) return s.userId
  const u = await prisma.user.findUnique({ where: { id: responsibleId }, select: { id: true } }).catch(() => null)
  return u?.id ?? null
}

async function notify(userId: string, tenantId: string | null, title: string, message: string): Promise<void> {
  await prisma.notification.create({ data: { userId, tenantId: tenantId ?? undefined, type: 'PENDENCIA_CRITICA', title, message, actionUrl: '/pendencias/central' } }).catch(() => {})
}

async function pushToUser(userId: string, title: string, body: string, pendencyId: string): Promise<number> {
  const devs = await prisma.mobileDevice.findMany({ where: { userId, isActive: true, platform: { in: ['ANDROID', 'IOS'] } }, select: { deviceToken: true } }).catch(() => [])
  const data = { type: 'PENDENCY', pendencyId, url: '/pendencias/minhas' }
  const [fcm, web] = await Promise.all([
    sendToTokens(devs.map((d) => d.deviceToken), { title, body, ttlSeconds: 3600, data, notification: true }).catch(() => ({ sent: 0, invalid: [] as string[] })),
    sendWebPushToUser(userId, { title, body, data }).catch(() => ({ sent: 0 })),
  ])
  return fcm.sent + web.sent
}

async function escalateToManagers(p: Candidate, reason: string): Promise<void> {
  const targets = new Set<string>()
  if (p.managerId) {
    const m = await prisma.manager.findUnique({ where: { id: p.managerId }, select: { userId: true } }).catch(() => null)
    if (m?.userId) targets.add(m.userId)
  }
  if (targets.size === 0 && p.tenantId) {
    const gers = await prisma.user.findMany({ where: { tenantId: p.tenantId, unitId: p.unitId, role: { in: ['GERENTE', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'ADM'] }, status: 'ATIVO' }, select: { id: true }, take: 10 }).catch(() => [])
    gers.forEach((g) => targets.add(g.id))
  }
  const title = '⚠️ Pendência CRÍTICA escalonada'
  const message = `${p.type ? p.type + ': ' : ''}${p.customerName}${p.plate ? ' — ' + p.plate : ''}: ${reason}`
  for (const uid of targets) await notify(uid, p.tenantId, title, message)
}

const lastEventAt = (events: NaggingEventLite[], type: string): number | null => {
  const ts = events.filter((e) => e.type === type).map((e) => new Date(e.createdAt).getTime())
  return ts.length ? Math.max(...ts) : null
}
const hasEvent = (events: NaggingEventLite[], type: string): boolean => events.some((e) => e.type === type)

export async function runPendencyNaggingSweep(opts?: { tenantId?: string }): Promise<NaggingRunResult> {
  const now = new Date()
  const result: NaggingRunResult = { scanned: 0, raised: 0, pushed: 0, escalated: 0, penalized: 0 }

  const pendencies = (await prisma.pendency.findMany({
    where: {
      status: { in: OPEN },
      OR: [{ priority: { in: ['ALTA', 'URGENTE'] } }, { severity: 'CRITICAL' }],
      ...(opts?.tenantId ? { tenantId: opts.tenantId } : {}),
    },
    take: 500,
    select: { id: true, tenantId: true, unitId: true, responsibleId: true, managerId: true, customerName: true, plate: true, type: true, priority: true, severity: true, status: true, escalatedAt: true },
  }).catch(() => [])) as Candidate[]
  result.scanned = pendencies.length
  if (!pendencies.length) return result

  // Eventos de todas as candidatas de uma vez. Sem a tabela (migration Fase 2
  // pendente) o motor não age — nada de marcar crítica sem poder gravar marco.
  let allEvents: Array<{ pendencyId: string } & NaggingEventLite>
  try {
    allEvents = await prisma.pendencyEvent.findMany({ where: { pendencyId: { in: pendencies.map((p) => p.id) } }, select: { pendencyId: true, type: true, newDueDate: true, createdAt: true } })
  } catch {
    return result
  }
  const byP = new Map<string, NaggingEventLite[]>()
  for (const e of allEvents) { const a = byP.get(e.pendencyId) ?? []; a.push(e); byP.set(e.pendencyId, a) }

  const cfgCache = new Map<string, PendencySlaEngineSettings>()
  const getCfg = async (tid: string | null): Promise<PendencySlaEngineSettings> => {
    const key = tid ?? ''
    const hit = cfgCache.get(key)
    if (hit) return hit
    const cfg = tid ? (await loadTenantPendencySettings(tid).catch(() => DEFAULT_PENDENCY_SETTINGS)).slaEngine : DEFAULT_PENDENCY_SETTINGS.slaEngine
    cfgCache.set(key, cfg)
    return cfg
  }

  for (const p of pendencies) {
    const cfg = await getCfg(p.tenantId)
    if (!cfg.enabled) continue
    const events = byP.get(p.id) ?? []

    // 1) Auto-elevar a Crítica.
    if (p.severity !== 'CRITICAL') {
      const decision = shouldBecomeCritical({ priority: p.priority, severity: p.severity, status: p.status, events, now, cfg })
      if (!decision.critical) continue
      await prisma.pendency.update({ where: { id: p.id }, data: { severity: 'CRITICAL' } }).catch(() => {})
      await logPendencyEvent({ tenantId: p.tenantId, pendencyId: p.id, type: PENDENCY_EVENT.CRITICAL_RAISED, content: decision.reason })
      events.push({ type: PENDENCY_EVENT.CRITICAL_RAISED, createdAt: now })
      p.severity = 'CRITICAL'
      result.raised++
      const uid = await responsibleUserId(p.responsibleId)
      if (uid) await notify(uid, p.tenantId, '🚨 Pendência elevada a CRÍTICA', `${p.customerName}${p.plate ? ' — ' + p.plate : ''}: ${decision.reason}. Resolva com urgência.`)
    } else if (!hasEvent(events, PENDENCY_EVENT.CRITICAL_RAISED)) {
      // Já era crítica (ex.: escalonamento antigo) mas sem marco → inicia o relógio.
      await logPendencyEvent({ tenantId: p.tenantId, pendencyId: p.id, type: PENDENCY_EVENT.CRITICAL_RAISED, content: 'marco de início do nagging' })
      events.push({ type: PENDENCY_EVENT.CRITICAL_RAISED, createdAt: now })
    }

    // 2) Nível de nagging.
    const level = criticalLevel(criticalSince(events), now, cfg)

    // Nível 2+: push periódico ao responsável.
    if (level >= 2) {
      const last = lastEventAt(events, PENDENCY_EVENT.REMINDER_SENT)
      if (!last || (now.getTime() - last) >= cfg.naggingPushIntervalMinutes * 60_000) {
        const uid = await responsibleUserId(p.responsibleId)
        if (uid) {
          await pushToUser(uid, '🚨 Pendência CRÍTICA', `${p.type ? p.type + ': ' : ''}${p.customerName}${p.plate ? ' — ' + p.plate : ''} está crítica. Trate agora.`, p.id)
          await logPendencyEvent({ tenantId: p.tenantId, pendencyId: p.id, type: PENDENCY_EVENT.REMINDER_SENT, content: `nagging nível ${level}` })
          events.push({ type: PENDENCY_EVENT.REMINDER_SENT, createdAt: now })
          result.pushed++
        }
      }
    }

    // 3) Nível 3: escala + penalidade (uma única vez).
    if (level >= 3) {
      if (!p.escalatedAt && !hasEvent(events, PENDENCY_EVENT.ESCALATED)) {
        await prisma.pendency.update({ where: { id: p.id }, data: { escalatedAt: now } }).catch(() => {})
        await escalateToManagers(p, 'crítica sem tratamento (nível 3)')
        await logPendencyEvent({ tenantId: p.tenantId, pendencyId: p.id, type: PENDENCY_EVENT.ESCALATED, content: 'nagging nível 3 (automático)' })
        result.escalated++
      }
      // Penalidade WARN_MANAGER — só avisa/marca. Uma ativa por pendência.
      const existing = await prisma.pendencyPenalty.findFirst({ where: { pendencyId: p.id, active: true }, select: { id: true } }).catch(() => 'unavailable' as const)
      if (existing === null) {
        const uid = await responsibleUserId(p.responsibleId)
        if (uid) {
          const created = await prisma.pendencyPenalty.create({ data: { tenantId: p.tenantId, unitId: p.unitId, pendencyId: p.id, sellerUserId: uid, type: 'WARN_MANAGER', reason: 'Pendência crítica não tratada (nível 3)' } }).catch(() => null)
          if (created) {
            await logPendencyEvent({ tenantId: p.tenantId, pendencyId: p.id, type: PENDENCY_EVENT.PENALTY_APPLIED, content: 'aviso ao gestor (crítica não tratada)' })
            await notify(uid, p.tenantId, '⚠️ Penalidade registrada', 'Uma pendência crítica sua não foi tratada a tempo. O gestor foi avisado. Resolva para regularizar.')
            await escalateToManagers(p, 'penalidade registrada (crítica não tratada)')
            result.penalized++
          }
        }
      }
    }
  }
  return result
}
