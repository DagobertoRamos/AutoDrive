// =============================================================================
// GET /api/master/dashboard — Dados agregados do Painel Master SaaS (MASTER only)
//
// TUDO aqui vem do banco. Antes havia chamados inventados ("#TKT-1024…"),
// tempo de aceite fixo (22s), "último tick 1min atrás" fixo e contagens que
// procuravam valores que o sistema nunca grava (plataforma WEB em vez de
// WEBPUSH, status ERROR em vez de FAILED, ação LOGIN_FAILED nunca registrada).
// "Dia" = dia em Brasília (UTC-3), não o dia UTC do servidor.
// =============================================================================

import { NextResponse } from 'next/server'
import { requireMaster } from '@/lib/master-guards'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { daysUntil, effectivePurgeAt, RETENTION_KEY_PREFIX, TENANT_STATUS_LABELS, type RetentionRecord } from '@/lib/tenant-lifecycle/core'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
/** Chamada da fila "presa": CALLED há mais que isso (o aceite normal leva segundos). */
const STUCK_CALL_MS = 15 * MIN

/** Início do dia de hoje em Brasília (UTC-3, sem horário de verão desde 2019). */
function brtDay(now: Date) {
  const brt = new Date(now.getTime() - 3 * HOUR)
  const y = brt.getUTCFullYear(), m = brt.getUTCMonth(), d = brt.getUTCDate()
  return { startOfToday: new Date(Date.UTC(y, m, d, 3)), dateOnly: new Date(Date.UTC(y, m, d)) }
}

function ago(date: Date, now: Date): string {
  const ms = now.getTime() - date.getTime()
  if (ms < HOUR) return `há ${Math.max(1, Math.round(ms / MIN))}min`
  if (ms < DAY) return `há ${Math.round(ms / HOUR)}h`
  return `há ${Math.round(ms / DAY)} dia(s)`
}

const fmtDateTime = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
interface Alert {
  id: string
  title: string
  tenantName: string
  priority: Priority
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED'
  durationText: string
  href?: string
}

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const now = new Date()
    const { startOfToday, dateOnly } = brtDay(now)
    const oneDayAgo = new Date(now.getTime() - DAY)
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY)
    const stuckBefore = new Date(now.getTime() - STUCK_CALL_MS)

    // 1. Banco de Dados - teste de conexão rápido
    let dbStatus: 'OK' | 'ERROR' = 'OK'
    let dbErrorMsg: string | null = null
    const dbStart = Date.now()
    let dbPingMs = 0
    try {
      await prisma.$queryRaw`SELECT 1`
      dbPingMs = Date.now() - dbStart
    } catch (err: unknown) {
      dbStatus = 'ERROR'
      dbErrorMsg = err instanceof Error ? err.message : 'Falha de conexão com o banco'
    }

    // 2. Coletas em paralelo
    const [
      tenants,
      maintenanceActive,
      mobileDevices,
      openQueuesToday,
      liveCalls,
      stuckCalls,
      acceptAvg,
      lastQueueEvent,
      pushFailures24h,
      failedLoginsToday,
      permissionChangesToday,
      blockedUsersToday,
      recentErrorsAudit,
      failedAudit24h,
      recentWebhookErrors,
      aiProviders,
      credentials,
      retentionSettings,
      recentAutoConf,
    ] = await Promise.all([
      prisma.tenant.findMany({
        select: { id: true, name: true, status: true, plan: true, createdAt: true, _count: { select: { units: true, users: true } } },
      }),
      prisma.maintenanceMode.findFirst({ where: { scope: 'GLOBAL', active: true }, orderBy: { createdAt: 'desc' } }),
      prisma.mobileDevice.findMany({ select: { platform: true, isActive: true, revokedAt: true } }),
      // Fila: só as abertas HOJE (antes contava todas as filas de todos os dias).
      prisma.sellerQueue.findMany({ where: { date: dateOnly, status: 'OPEN' }, select: { tenantId: true } }),
      prisma.sellerQueueAttendance.count({ where: { status: 'CALLED', calledAt: { gte: stuckBefore } } }),
      prisma.sellerQueueAttendance.findMany({
        where: { status: 'CALLED', calledAt: { lt: stuckBefore, gte: sevenDaysAgo } },
        select: { calledAt: true, tenantId: true },
        orderBy: { calledAt: 'asc' },
      }),
      prisma.$queryRaw<{ avg: number | null; n: bigint }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "calledAt")))::float AS avg, COUNT(*) AS n
          FROM seller_queue_attendances
         WHERE "acceptedAt" IS NOT NULL AND "calledAt" >= ${sevenDaysAgo}
           AND "acceptedAt" >= "calledAt" AND "acceptedAt" - "calledAt" < interval '1 hour'`,
      prisma.sellerQueueEvent.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.notificationDelivery.count({ where: { status: 'ERRO', createdAt: { gte: oneDayAgo } } }),
      prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', createdAt: { gte: startOfToday } } }),
      prisma.auditLog.count({
        where: {
          action: { in: ['PERMISSION_UPDATE', 'PERMISSION_RESTORE_DEFAULT', 'ENABLE_MODULE', 'DISABLE_MODULE', 'UPDATE_ROLE', 'UPDATE_CARGO', 'UPDATE_PERMISSIONS'] },
          createdAt: { gte: startOfToday },
        },
      }),
      prisma.user.count({ where: { status: 'BLOQUEADO', updatedAt: { gte: startOfToday } } }),
      // Erros: o sistema grava status FAILED (antes procurava ERROR → lista sempre vazia).
      prisma.auditLog.findMany({
        where: { status: { in: ['FAILED', 'ERROR'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, action: true, entity: true, userName: true, errorMessage: true, createdAt: true },
      }),
      prisma.auditLog.count({ where: { status: { in: ['FAILED', 'ERROR'] }, createdAt: { gte: oneDayAgo } } }),
      prisma.webhookLog.findMany({
        where: { error: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, provider: true, direction: true, error: true, createdAt: true },
      }),
      prisma.aiProvider.findMany({ select: { id: true, name: true, code: true, model: true, active: true, updatedAt: true } }),
      prisma.integrationCredential.findMany({
        select: { id: true, service: true, name: true, active: true, lastTestedAt: true, lastTestOk: true, lastTestMsg: true },
      }),
      prisma.systemSetting.findMany({ where: { key: { startsWith: RETENTION_KEY_PREFIX } }, select: { value: true } }),
      prisma.deal.findFirst({ where: { source: 'AUTOCONF' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ])

    const tenantName = new Map(tenants.map((t) => [t.id, t.name]))

    // 3. Tenants
    const count = (s: string) => tenants.filter((t) => t.status === s).length
    const tenantSummary = {
      total: tenants.length,
      ativo: count('ATIVO'),
      teste: count('TESTE'),
      suspenso: count('SUSPENSO'),
      bloqueado: count('BLOQUEADO'),
      inadimplente: count('INADIMPLENTE'),
      paused: count('PAUSADO'),
      cancelado: count('CANCELADO'),
      desativado: count('BANIDO'),
    }

    const retention = new Map<string, RetentionRecord>()
    for (const s of retentionSettings) {
      try { const r = JSON.parse(s.value) as RetentionRecord; retention.set(r.tenantId, r) } catch { /* ignora registro corrompido */ }
    }

    const tenantWarnings: Array<{ id: string; name: string; plan: string; status: string; issue: string; action: string }> = []
    for (const t of tenants) {
      const base = { id: t.id, name: t.name, plan: t.plan, status: t.status }
      if (t.status === 'BANIDO') {
        const r = retention.get(t.id)
        const left = r ? daysUntil(effectivePurgeAt(r).toISOString(), now) : null
        tenantWarnings.push({ ...base, issue: left != null ? `Desativada — dados apagados em ${left} dia(s)` : 'Desativada', action: 'Ver loja' })
      } else if (t.status === 'SUSPENSO' || t.status === 'BLOQUEADO' || t.status === 'INADIMPLENTE' || t.status === 'CANCELADO') {
        tenantWarnings.push({ ...base, issue: `${TENANT_STATUS_LABELS[t.status]} — usuários sem acesso`, action: 'Ver loja' })
      } else if (t._count.units === 0) {
        tenantWarnings.push({ ...base, issue: 'Nenhuma unidade cadastrada', action: 'Configurar unidade' })
      } else if (t._count.users === 0) {
        tenantWarnings.push({ ...base, issue: 'Nenhum usuário cadastrado', action: 'Adicionar usuário' })
      }
    }

    // 4. Push / dispositivos (plataformas reais: ANDROID | IOS | WEBPUSH)
    const pushStats = {
      fcmActive: mobileDevices.filter((d) => (d.platform === 'ANDROID' || d.platform === 'IOS') && d.isActive).length,
      webPushActive: mobileDevices.filter((d) => (d.platform === 'WEBPUSH' || d.platform === 'WEB') && d.isActive).length,
      invalidSubscriptions: mobileDevices.filter((d) => !d.isActive || d.revokedAt).length,
      failures24h: pushFailures24h, // entregas de notificação com ERRO nas últimas 24h
    }

    // 5. Integrações
    const integrationsSummary: Array<{
      id: string; name: string; service: string
      status: 'CONNECTED' | 'INACTIVE' | 'ERROR' | 'UNCONFIGURED'
      lastTested: string | null; lastMsg: string | null
    }> = []
    for (const prov of aiProviders) {
      integrationsSummary.push({
        id: prov.id,
        name: `IA: ${prov.name}`,
        service: prov.code,
        status: prov.active ? 'CONNECTED' : 'INACTIVE',
        lastTested: null,
        lastMsg: `Modelo: ${prov.model ?? 'não especificado'}`,
      })
    }
    if (aiProviders.length === 0) {
      integrationsSummary.push({ id: 'ai-none', name: 'Provedor de IA', service: 'AI', status: 'UNCONFIGURED', lastTested: null, lastMsg: 'Nenhum provedor configurado' })
    }
    for (const cred of credentials) {
      integrationsSummary.push({
        id: cred.id,
        name: cred.name,
        service: cred.service,
        status: !cred.active ? 'INACTIVE' : cred.lastTestedAt == null ? 'UNCONFIGURED' : cred.lastTestOk ? 'CONNECTED' : 'ERROR',
        lastTested: cred.lastTestedAt ? fmtDateTime(cred.lastTestedAt) : null,
        lastMsg: cred.lastTestMsg ?? (!cred.active ? 'Desativada' : cred.lastTestedAt ? 'Ativa' : 'Ativa, nunca testada'),
      })
    }
    integrationsSummary.push({
      id: 'autoconf',
      name: 'Integração AutoConf',
      service: 'AUTOCONF',
      status: recentAutoConf ? 'CONNECTED' : 'UNCONFIGURED',
      lastTested: recentAutoConf ? fmtDateTime(recentAutoConf.createdAt) : null,
      lastMsg: recentAutoConf
        ? `Última negociação importada: ${fmtDateTime(recentAutoConf.createdAt)} (${ago(recentAutoConf.createdAt, now)})`
        : 'Nenhuma negociação importada ainda',
    })

    // 6. Alertas reais da plataforma (substituem os "chamados" inventados)
    const alerts: Alert[] = []
    if (dbStatus === 'ERROR') {
      alerts.push({ id: 'DB', title: 'Falha de conexão com o banco de dados', tenantName: 'Infraestrutura', priority: 'CRITICAL', status: 'OPEN', durationText: 'agora' })
    }
    if (maintenanceActive) {
      alerts.push({ id: 'MNT', title: 'Manutenção global ativa', tenantName: 'Plataforma', priority: 'HIGH', status: 'IN_PROGRESS', durationText: ago(maintenanceActive.createdAt, now) })
    }
    for (const r of retention.values()) {
      const left = daysUntil(effectivePurgeAt(r).toISOString(), now)
      if (left <= 180) {
        alerts.push({
          id: `RET-${r.tenantId.slice(-4).toUpperCase()}`,
          title: `Dados da loja serão APAGADOS — faça o backup`,
          tenantName: r.tenantName,
          priority: left <= 30 ? 'CRITICAL' : 'HIGH',
          status: 'OPEN',
          durationText: `em ${left} dia(s)`,
          href: `/master/tenants/${r.tenantId}`,
        })
      }
      if (r.lastError) {
        alerts.push({ id: `PRG-${r.tenantId.slice(-4).toUpperCase()}`, title: `Exclusão automática falhou: ${r.lastError}`, tenantName: r.tenantName, priority: 'HIGH', status: 'OPEN', durationText: '—', href: `/master/tenants/${r.tenantId}` })
      }
    }
    for (const t of tenants) {
      if (t.status === 'SUSPENSO' || t.status === 'BLOQUEADO' || t.status === 'INADIMPLENTE') {
        alerts.push({ id: `TEN-${t.id.slice(-4).toUpperCase()}`, title: `Loja ${TENANT_STATUS_LABELS[t.status].toLowerCase()}`, tenantName: t.name, priority: 'MEDIUM', status: 'WAITING', durationText: TENANT_STATUS_LABELS[t.status], href: `/master/tenants/${t.id}` })
      }
    }
    if (stuckCalls.length) {
      const byTenant = new Map<string, number>()
      for (const c of stuckCalls) byTenant.set(c.tenantId, (byTenant.get(c.tenantId) ?? 0) + 1)
      alerts.push({
        id: 'FILA',
        title: `${stuckCalls.length} chamada(s) da fila sem resposta há mais de ${STUCK_CALL_MS / MIN}min`,
        tenantName: [...byTenant.keys()].map((id) => tenantName.get(id) ?? id).join(', '),
        priority: 'HIGH',
        status: 'OPEN',
        durationText: `desde ${ago(stuckCalls[0].calledAt, now)}`,
      })
    }
    for (const cred of credentials) {
      if (cred.active && cred.lastTestedAt && !cred.lastTestOk) {
        alerts.push({ id: `INT-${cred.id.slice(-4).toUpperCase()}`, title: `Integração com falha no último teste: ${cred.name}`, tenantName: cred.service, priority: 'MEDIUM', status: 'OPEN', durationText: ago(cred.lastTestedAt, now), href: '/master/integrations' })
      }
    }
    if (failedAudit24h > 0) {
      alerts.push({ id: 'ERR', title: `${failedAudit24h} operação(ões) com falha nas últimas 24h`, tenantName: 'Auditoria', priority: failedAudit24h >= 20 ? 'HIGH' : 'LOW', status: 'OPEN', durationText: '24h', href: '/master/audit' })
    }
    if (pushFailures24h > 0) {
      alerts.push({ id: 'PUSH', title: `${pushFailures24h} notificação(ões) não entregue(s) nas últimas 24h`, tenantName: 'Notificações', priority: 'LOW', status: 'OPEN', durationText: '24h' })
    }
    const rank: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    alerts.sort((a, b) => rank[a.priority] - rank[b.priority])

    // 7. Erros recentes (ordenados pela data real, não pelo texto da hora)
    const recentErrors = [
      ...recentErrorsAudit.map((e) => ({
        at: e.createdAt,
        service: `Auditoria: ${e.action} / ${e.entity}`,
        message: e.errorMessage ?? 'Falha sem mensagem',
        tenant: e.userName ?? 'Sistema',
      })),
      ...recentWebhookErrors.map((e) => ({
        at: e.createdAt,
        service: `Webhook: ${e.provider ?? 'desconhecido'} (${e.direction ?? 'IN'})`,
        message: e.error ?? 'Falha de processamento',
        tenant: 'Integrações',
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 10)
      .map(({ at, ...rest }) => ({ time: fmtDateTime(at), ...rest }))

    // 8. Saúde geral
    let overallHealth: 'healthy' | 'warning' | 'degraded' | 'critical' = 'healthy'
    if (alerts.some((a) => a.priority === 'CRITICAL')) overallHealth = 'critical'
    else if (maintenanceActive) overallHealth = 'degraded'
    else if (alerts.some((a) => a.priority === 'HIGH')) overallHealth = 'warning'
    const healthIssuesCount = alerts.filter((a) => a.priority === 'CRITICAL' || a.priority === 'HIGH').length

    // 9. Deploy (a Vercel não expõe a data do deploy; mostramos a mensagem do commit)
    const deployInfo = {
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'local',
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-dev').substring(0, 7),
      env: process.env.VERCEL_ENV ?? 'development',
      message: (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '').split('\n')[0] || null,
    }

    const avg = acceptAvg[0]?.avg
    return NextResponse.json({
      success: true,
      data: {
        platform: {
          status: overallHealth,
          issuesCount: healthIssuesCount,
          maintenanceActive: !!maintenanceActive,
          lastIncidentAt: maintenanceActive?.createdAt ? new Date(maintenanceActive.createdAt).toISOString() : null,
        },
        tenants: { summary: tenantSummary, warnings: tenantWarnings.slice(0, 10) },
        tickets: {
          open: alerts.filter((t) => t.status === 'OPEN').length,
          critical: alerts.filter((t) => t.priority === 'CRITICAL').length,
          overdue: alerts.filter((t) => t.priority === 'HIGH').length,
          inProgress: alerts.filter((t) => t.status === 'IN_PROGRESS').length,
          waiting: alerts.filter((t) => t.status === 'WAITING').length,
          items: alerts.slice(0, 12),
        },
        infrastructure: {
          database: { status: dbStatus, pingMs: dbPingMs, error: dbErrorMsg },
          queueActivity: lastQueueEvent ? { lastEventAt: lastQueueEvent.createdAt.toISOString(), ago: ago(lastQueueEvent.createdAt, now) } : null,
          deploy: deployInfo,
        },
        integrations: integrationsSummary,
        notifications: pushStats,
        queue: {
          activeQueues: new Set(openQueuesToday.map((q) => q.tenantId)).size,
          openUnits: openQueuesToday.length,
          pendingCalls: liveCalls,
          stuckCalls: stuckCalls.length,
          averageAcceptSeconds: avg != null ? Math.round(avg) : null,
          acceptSample: Number(acceptAvg[0]?.n ?? 0),
        },
        security: { failedLoginsToday, permissionChangesToday, blockedUsers: blockedUsersToday },
        recentErrors,
      },
    })
  } catch (err) {
    console.error('[GET /api/master/dashboard]', err)
    return handlePrismaError(err)
  }
}
