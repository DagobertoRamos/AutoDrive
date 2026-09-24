// =============================================================================
// CRM — varredura de SLA e follow-up (Fase B). Roda no job periódico
// (/api/queue/jobs/tick) para as lojas que LIGARAM o SLA em Configurações do CRM.
//   • 1º contato: lead aberto sem nenhum contato além do prazo → avisa o
//     responsável (uma vez).
//   • Sem contato: lead aberto parado além do limite → avisa o responsável e,
//     se configurado, cria tarefa de follow-up (uma vez por período parado).
//   • Gestores recebem UM resumo por loja quando houver estouros.
//   • Se a loja pediu, roda também SLA + distribuição da Mesa SDR.
// Idempotente: as marcas ficam em MarketingLead.metadata.sla.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notify, notifyByRole } from '@/services/notification.service'
import { distributePendingLeads, processSlaBreaches } from '@/lib/marketing/distribution'
import { evaluateLeadSla, OPEN_LEAD_STATUSES, readSlaMarks, sanitizeCrmSettings, type CrmSettings } from './settings-core'

const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const MAX_LEADS_PER_TENANT = 500

export interface CrmSlaSweepResult { tenants: number; firstContactAlerts: number; noContactAlerts: number; tasksCreated: number; sdrRuns: number }

async function tenantsWithRules(): Promise<{ tenantId: string; settings: CrmSettings }[]> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { startsWith: 't:', endsWith: ':crm_settings:v1' } },
    select: { key: true, value: true },
  })
  return rows.flatMap((r) => {
    const tenantId = r.key.slice(2, -':crm_settings:v1'.length)
    try {
      const settings = sanitizeCrmSettings(JSON.parse(r.value))
      return settings.sla.enabled || settings.distribution.runSdrInTick ? [{ tenantId, settings }] : []
    } catch { return [] }
  })
}

async function sweepTenant(tenantId: string, settings: CrmSettings, now: Date, out: CrmSlaSweepResult) {
  const cfg = settings.sla
  const leads = await prisma.marketingLead.findMany({
    where: { tenantId, deletedAt: null, status: { in: [...OPEN_LEAD_STATUSES] } },
    select: { id: true, name: true, phone: true, status: true, createdAt: true, lastContactAt: true, assignedToUserId: true, unitId: true, metadata: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_LEADS_PER_TENANT,
  })

  let lateFirst = 0, lateNoContact = 0
  for (const lead of leads) {
    const marks = readSlaMarks(lead.metadata)
    const v = evaluateLeadSla({ status: lead.status, createdAt: lead.createdAt, lastContactAt: lead.lastContactAt, marks }, cfg, now)
    if (!v.alertFirstContact && !v.alertNoContact) continue

    const who = lead.name || lead.phone || 'Lead sem nome'
    const actionUrl = `/crm/leads/${lead.id}`
    const nextMarks = { ...marks }

    if (v.alertFirstContact) {
      lateFirst++; out.firstContactAlerts++
      nextMarks.firstContactAlertedAt = now.toISOString()
      if (lead.assignedToUserId) {
        await notify({
          userId: lead.assignedToUserId, tenantId, type: 'SISTEMA', actionUrl,
          title: 'Lead aguardando o 1º contato',
          message: `${who} está sem contato há mais de ${cfg.firstContactMinutes} min.`,
          metadata: { kind: 'crm_sla_first_contact', leadId: lead.id }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
        }).catch(() => {})
      }
    }

    if (v.alertNoContact) {
      lateNoContact++; out.noContactAlerts++
      nextMarks.noContactAlertedFor = v.noContactRef
      if (lead.assignedToUserId) {
        await notify({
          userId: lead.assignedToUserId, tenantId, type: 'SISTEMA', actionUrl,
          title: 'Lead parado sem contato',
          message: `${who} está sem contato há mais de ${cfg.noContactHours} h.`,
          metadata: { kind: 'crm_sla_no_contact', leadId: lead.id }, channels: ['APP_WEB', 'APP_MOBILE'],
        }).catch(() => {})
      }
      if (cfg.createFollowUpTask) {
        const pending = await prisma.marketingLeadTask.count({ where: { leadId: lead.id, status: 'PENDING' } })
        if (pending === 0) {
          await prisma.marketingLeadTask.create({
            data: {
              tenantId, leadId: lead.id, type: 'FOLLOW_UP', status: 'PENDING', dueAt: now,
              title: `Follow-up: ${cfg.noContactHours}h sem contato`,
              assignedToUserId: lead.assignedToUserId ?? undefined,
            },
          }).then(() => { out.tasksCreated++ }).catch(() => {})
        }
      }
    }

    const meta = lead.metadata && typeof lead.metadata === 'object' ? { ...(lead.metadata as Record<string, unknown>) } : {}
    await prisma.marketingLead.update({ where: { id: lead.id }, data: { metadata: { ...meta, sla: { ...nextMarks } } } }).catch(() => {})
  }

  if (cfg.escalateToManagers && (lateFirst || lateNoContact)) {
    const parts = [
      lateFirst ? `${lateFirst} sem o 1º contato no prazo (${cfg.firstContactMinutes} min)` : '',
      lateNoContact ? `${lateNoContact} parado(s) há mais de ${cfg.noContactHours} h` : '',
    ].filter(Boolean)
    await notifyByRole({
      tenantId, roles: MANAGER_ROLES, type: 'SISTEMA', actionUrl: '/crm/leads?delayed=true',
      title: 'SLA do CRM estourado',
      message: `Leads fora do SLA: ${parts.join(' e ')}.`,
      metadata: { kind: 'crm_sla_summary', lateFirst, lateNoContact }, channels: ['APP_WEB', 'APP_MOBILE'],
    }).catch(() => {})
  }
}

export async function runCrmSlaSweep(now = new Date()): Promise<CrmSlaSweepResult> {
  const out: CrmSlaSweepResult = { tenants: 0, firstContactAlerts: 0, noContactAlerts: 0, tasksCreated: 0, sdrRuns: 0 }
  for (const { tenantId, settings } of await tenantsWithRules()) {
    out.tenants++
    if (settings.sla.enabled) await sweepTenant(tenantId, settings, now, out).catch(() => {})
    if (settings.distribution.runSdrInTick) {
      await processSlaBreaches(tenantId).catch(() => {})
      await distributePendingLeads(tenantId).catch(() => {})
      out.sdrRuns++
    }
  }
  return out
}
