// =============================================================================
// CRM — motor de Automações (Fase C). Executa as regras configuradas em
// Configurações do CRM → Automações.
//   • STAGE_ENTERED: disparado na hora pelas rotas que movem o lead.
//   • LEAD_CREATED: disparado no cadastro do CRM e, para TODAS as origens
//     (AutoConf, fila, SDR…), pela varredura do job periódico.
//   • NO_CONTACT: varredura do job periódico (uma vez por período parado).
// Idempotência: marcas em MarketingLead.metadata.automations[ruleId].
// Cada execução vai para o AuditLog (entity CrmAutomation) — aba Auditoria.
// Tudo best-effort: automação nunca derruba a operação que a disparou.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notify, notifyByRole } from '@/services/notification.service'
import { readTemperature } from './config'
import { isMaterialized, loadPipelines, loadPlacement, resolveLeadPipeline, resolveLeadStage, type Pipeline } from './pipelines'
import { loadCrmSettings, readLeadType, sanitizeCrmSettings, OPEN_LEAD_STATUSES, type CrmSettings } from './settings'
import { describeAction, matchingRules, readAutomationMarks, type AutomationAction, type AutomationLeadCtx, type AutomationRule, type AutomationTrigger } from './automations-core'

export * from './automations-core'

const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const CREATED_LOOKBACK_MS = 7 * 86_400_000

type LeadRow = {
  id: string; tenantId: string; name: string | null; phone: string | null; status: string; source: string | null
  unitId: string | null; assignedToUserId: string | null; metadata: unknown; createdAt: Date; lastContactAt: Date | null
}
const LEAD_SELECT = { id: true, tenantId: true, name: true, phone: true, status: true, source: true, unitId: true, assignedToUserId: true, metadata: true, createdAt: true, lastContactAt: true } as const

async function leadCtx(lead: LeadRow, pipelines: Pipeline[]): Promise<AutomationLeadCtx> {
  const placement = isMaterialized(pipelines) ? await loadPlacement(lead.id) : null
  const pipeline = resolveLeadPipeline(pipelines, placement?.pipelineId)
  const stage = pipeline ? resolveLeadStage(pipeline, lead.status, placement?.stageId) : null
  return {
    pipelineId: pipeline?.id ?? null, stageId: stage?.id ?? null, status: lead.status, source: lead.source,
    leadType: readLeadType(lead.metadata), temperature: readTemperature(lead.metadata),
  }
}

const fill = (text: string, lead: LeadRow) => text.replace(/\{lead\}/g, lead.name || lead.phone || 'o lead')

async function runAction(a: AutomationAction, lead: LeadRow, rule: AutomationRule): Promise<void> {
  const tenantId = lead.tenantId
  const actionUrl = `/crm/leads/${lead.id}`
  switch (a.type) {
    case 'CREATE_TASK':
      await prisma.marketingLeadTask.create({
        data: {
          tenantId, leadId: lead.id, type: a.taskType, status: 'PENDING', title: fill(a.title, lead),
          dueAt: new Date(Date.now() + a.dueInHours * 3_600_000),
          assignedToUserId: lead.assignedToUserId ?? undefined, notes: `Automação: ${rule.name}`,
        },
      })
      return
    case 'NOTIFY': {
      const message = fill(a.message, lead)
      const base = { tenantId, type: 'SISTEMA', title: rule.name, message, actionUrl, metadata: { kind: 'crm_automation', ruleId: rule.id, leadId: lead.id } }
      if (a.target === 'MANAGERS') await notifyByRole({ ...base, roles: MANAGER_ROLES, ...(lead.unitId ? { unitId: lead.unitId } : {}), channels: ['APP_WEB', 'APP_MOBILE'] })
      else if (lead.assignedToUserId) await notify({ ...base, userId: lead.assignedToUserId, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] })
      return
    }
    case 'ADD_TAG': {
      const tag = await prisma.crmTag.findFirst({ where: { id: a.tagId, tenantId, active: true }, select: { id: true } })
      if (tag) await prisma.crmLeadTag.upsert({ where: { leadId_tagId: { leadId: lead.id, tagId: tag.id } }, create: { tenantId, leadId: lead.id, tagId: tag.id }, update: {} })
      return
    }
    case 'SET_TEMPERATURE': {
      const fresh = await prisma.marketingLead.findUnique({ where: { id: lead.id }, select: { metadata: true } })
      const meta = fresh?.metadata && typeof fresh.metadata === 'object' ? { ...(fresh.metadata as Record<string, unknown>) } : {}
      await prisma.marketingLead.update({ where: { id: lead.id }, data: { metadata: { ...meta, temperature: a.value } } })
      return
    }
    case 'ASSIGN_USER': {
      const user = await prisma.user.findFirst({ where: { id: a.userId, tenantId, status: 'ATIVO' }, select: { id: true } })
      if (!user || user.id === lead.assignedToUserId) return
      await prisma.marketingLead.update({ where: { id: lead.id }, data: { assignedToUserId: user.id } })
      await prisma.marketingLeadAssignment.create({
        data: { tenantId, leadId: lead.id, assignedToUserId: user.id, mode: 'MANUAL', status: 'ASSIGNED', reason: `Automação: ${rule.name}` },
      }).catch(() => {})
      lead.assignedToUserId = user.id // ações seguintes (tarefa/aviso) já vão para o novo dono
      return
    }
  }
}

/** Executa as regras que casam com o evento; grava marcas (se houver) e auditoria. */
async function execute(lead: LeadRow, rules: AutomationRule[], trigger: AutomationTrigger, markFor?: (rule: AutomationRule) => string): Promise<number> {
  if (!rules.length) return 0
  for (const rule of rules) {
    const results: string[] = []
    for (const action of rule.actions) {
      try { await runAction(action, lead, rule); results.push(`✓ ${describeAction(action)}`) }
      catch (e) { results.push(`✗ ${describeAction(action)}: ${e instanceof Error ? e.message : String(e)}`) }
    }
    // Sem usuário (AuditLog.userId tem FK p/ User): ator = "Automação do CRM".
    await prisma.auditLog.create({
      data: {
        tenantId: lead.tenantId, userId: null, userName: 'Automação do CRM', userRole: 'SISTEMA',
        action: `AUTOMATION_${trigger}`, entity: 'CrmAutomation', entityId: lead.id,
        afterData: { ruleId: rule.id, ruleName: rule.name, leadId: lead.id, results },
        status: results.some((r) => r.startsWith('✗')) ? 'PARTIAL' : 'SUCCESS',
      },
    }).catch(() => {})
  }
  if (markFor) {
    const fresh = await prisma.marketingLead.findUnique({ where: { id: lead.id }, select: { metadata: true } })
    const meta = fresh?.metadata && typeof fresh.metadata === 'object' ? { ...(fresh.metadata as Record<string, unknown>) } : {}
    const marks = { ...readAutomationMarks(meta), ...Object.fromEntries(rules.map((r) => [r.id, markFor(r)])) }
    await prisma.marketingLead.update({ where: { id: lead.id }, data: { metadata: { ...meta, automations: marks } } }).catch(() => {})
  }
  return rules.length
}

/**
 * Dispara as automações de um evento para um lead. Uso nas rotas (STAGE_ENTERED
 * a cada entrada em etapa; LEAD_CREATED uma vez por regra). Nunca lança.
 */
export async function fireAutomations(tenantId: string, trigger: 'LEAD_CREATED' | 'STAGE_ENTERED', leadId: string, preload?: { settings?: CrmSettings; pipelines?: Pipeline[] }): Promise<void> {
  try {
    const settings = preload?.settings ?? await loadCrmSettings(tenantId)
    const candidates = settings.automations.filter((r) => r.active && r.trigger === trigger)
    if (!candidates.length) return
    const lead = await prisma.marketingLead.findFirst({ where: { id: leadId, tenantId }, select: LEAD_SELECT }) as LeadRow | null
    if (!lead) return
    const ctx = await leadCtx(lead, preload?.pipelines ?? await loadPipelines(tenantId))
    let rules = matchingRules(candidates, { trigger, lead: ctx })
    if (trigger === 'LEAD_CREATED') {
      const marks = readAutomationMarks(lead.metadata)
      rules = rules.filter((r) => !marks[r.id] && lead.createdAt >= new Date(r.createdAt))
      await execute(lead, rules, trigger, () => 'done')
    } else {
      await execute(lead, rules, trigger)
    }
  } catch (e) {
    console.warn('[crm-automations] falhou:', e instanceof Error ? e.message : e)
  }
}

export interface AutomationSweepResult { tenants: number; created: number; noContact: number }

/** Varredura do job periódico: LEAD_CREATED (todas as origens) e NO_CONTACT. */
export async function runCrmAutomationSweep(now = new Date()): Promise<AutomationSweepResult> {
  const out: AutomationSweepResult = { tenants: 0, created: 0, noContact: 0 }
  const rows = await prisma.systemSetting.findMany({ where: { key: { startsWith: 't:', endsWith: ':crm_settings:v1' } }, select: { key: true, value: true } })
  for (const row of rows) {
    let settings: CrmSettings
    try { settings = sanitizeCrmSettings(JSON.parse(row.value)) } catch { continue }
    const created = settings.automations.filter((r) => r.active && r.trigger === 'LEAD_CREATED')
    const stale = settings.automations.filter((r) => r.active && r.trigger === 'NO_CONTACT')
    if (!created.length && !stale.length) continue
    const tenantId = row.key.slice(2, -':crm_settings:v1'.length)
    out.tenants++
    try {
      const pipelines = await loadPipelines(tenantId)

      if (created.length) {
        const since = new Date(Math.max(now.getTime() - CREATED_LOOKBACK_MS, Math.min(...created.map((r) => Date.parse(r.createdAt)))))
        const leads = await prisma.marketingLead.findMany({ where: { tenantId, deletedAt: null, createdAt: { gte: since } }, select: LEAD_SELECT, take: 300, orderBy: { createdAt: 'asc' } }) as LeadRow[]
        for (const lead of leads) {
          const marks = readAutomationMarks(lead.metadata)
          const pending = created.filter((r) => !marks[r.id] && lead.createdAt >= new Date(r.createdAt))
          if (!pending.length) continue
          const rules = matchingRules(pending, { trigger: 'LEAD_CREATED', lead: await leadCtx(lead, pipelines) })
          // Marca também as que NÃO casaram: o lead já foi avaliado p/ elas.
          out.created += await execute(lead, rules, 'LEAD_CREATED')
          const meta = lead.metadata && typeof lead.metadata === 'object' ? { ...(lead.metadata as Record<string, unknown>) } : {}
          const fresh = await prisma.marketingLead.findUnique({ where: { id: lead.id }, select: { metadata: true } })
          const base = fresh?.metadata && typeof fresh.metadata === 'object' ? { ...(fresh.metadata as Record<string, unknown>) } : meta
          await prisma.marketingLead.update({ where: { id: lead.id }, data: { metadata: { ...base, automations: { ...readAutomationMarks(base), ...Object.fromEntries(pending.map((r) => [r.id, 'done'])) } } } }).catch(() => {})
        }
      }

      if (stale.length) {
        const minHours = Math.min(...stale.map((r) => r.hours))
        const cutoff = new Date(now.getTime() - minHours * 3_600_000)
        const leads = await prisma.marketingLead.findMany({
          where: { tenantId, deletedAt: null, status: { in: [...OPEN_LEAD_STATUSES] }, OR: [{ lastContactAt: { lt: cutoff } }, { lastContactAt: null, createdAt: { lt: cutoff } }] },
          select: LEAD_SELECT, take: 500, orderBy: { createdAt: 'asc' },
        }) as LeadRow[]
        for (const lead of leads) {
          const ref = (lead.lastContactAt ?? lead.createdAt)
          const refIso = ref.toISOString()
          const marks = readAutomationMarks(lead.metadata)
          // Só estouros depois da criação da regra (sem avalanche do histórico).
          const due = stale.filter((r) => marks[r.id] !== refIso && now.getTime() - ref.getTime() > r.hours * 3_600_000 && ref.getTime() + r.hours * 3_600_000 >= Date.parse(r.createdAt))
          if (!due.length) continue
          const rules = matchingRules(due, { trigger: 'NO_CONTACT', lead: await leadCtx(lead, pipelines) })
          out.noContact += await execute(lead, rules, 'NO_CONTACT', () => refIso)
        }
      }
    } catch (e) {
      console.warn('[crm-automations] varredura falhou:', tenantId, e instanceof Error ? e.message : e)
    }
  }
  return out
}
