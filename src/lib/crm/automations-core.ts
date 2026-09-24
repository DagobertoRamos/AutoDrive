// =============================================================================
// CRM — Automações (Fase C). Núcleo PURO (client-safe, testado).
// Regra = gatilho → condições → ações. Guardadas no JSON de configurações do
// CRM (seção `automations`). Ações nunca movem o lead de etapa → sem laços.
//   Gatilhos: LEAD_CREATED | STAGE_ENTERED | NO_CONTACT (após N horas)
//   Condições (todas opcionais, E lógico): funil, etapa/status (p/ STAGE_ENTERED),
//     origens, tipos de lead, temperaturas.
//   Ações: CREATE_TASK | NOTIFY | ADD_TAG | SET_TEMPERATURE | ASSIGN_USER
// =============================================================================

export const AUTOMATION_TRIGGERS = ['LEAD_CREATED', 'STAGE_ENTERED', 'NO_CONTACT'] as const
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]
export const AUTOMATION_ACTIONS = ['CREATE_TASK', 'NOTIFY', 'ADD_TAG', 'SET_TEMPERATURE', 'ASSIGN_USER'] as const
export type AutomationActionType = (typeof AUTOMATION_ACTIONS)[number]
const TASK_TYPES = ['FOLLOW_UP', 'CALL', 'WHATSAPP', 'EMAIL', 'OTHER'] as const
const TEMPS = ['BOILING', 'HOT', 'WARM', 'COLD'] as const
export const MAX_AUTOMATIONS = 50
export const MAX_ACTIONS_PER_RULE = 5

export interface AutomationConditions {
  pipelineId?: string
  stageId?: string       // STAGE_ENTERED: etapa exata
  statusCode?: string    // STAGE_ENTERED: qualquer etapa com esse status
  sources?: string[]
  leadTypes?: string[]
  temperatures?: string[]
}

export type AutomationAction =
  | { type: 'CREATE_TASK'; title: string; taskType: string; dueInHours: number }
  | { type: 'NOTIFY'; target: 'ASSIGNEE' | 'MANAGERS'; message: string }
  | { type: 'ADD_TAG'; tagId: string }
  | { type: 'SET_TEMPERATURE'; value: string }
  | { type: 'ASSIGN_USER'; userId: string }

export interface AutomationRule {
  id: string
  name: string
  active: boolean
  trigger: AutomationTrigger
  hours: number          // NO_CONTACT
  conditions: AutomationConditions
  actions: AutomationAction[]
  createdAt: string      // LEAD_CREATED só vale p/ leads criados depois da regra
}

/** Contexto do lead no momento do evento. */
export interface AutomationLeadCtx {
  pipelineId: string | null
  stageId: string | null
  status: string
  source: string | null
  leadType: string | null
  temperature: string | null
}

export interface AutomationEvent {
  trigger: AutomationTrigger
  lead: AutomationLeadCtx
}

const str = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max)
const strList = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()))] : []

function sanitizeAction(a: Record<string, unknown>): AutomationAction | null {
  switch (a.type) {
    case 'CREATE_TASK': {
      const title = str(a.title)
      if (!title) return null
      const taskType = (TASK_TYPES as readonly string[]).includes(String(a.taskType)) ? String(a.taskType) : 'FOLLOW_UP'
      const h = Number(a.dueInHours)
      return { type: 'CREATE_TASK', title, taskType, dueInHours: Number.isFinite(h) ? Math.min(24 * 90, Math.max(0, Math.round(h))) : 0 }
    }
    case 'NOTIFY': {
      const message = str(a.message, 300)
      if (!message) return null
      return { type: 'NOTIFY', target: a.target === 'MANAGERS' ? 'MANAGERS' : 'ASSIGNEE', message }
    }
    case 'ADD_TAG': return str(a.tagId) ? { type: 'ADD_TAG', tagId: str(a.tagId) } : null
    case 'SET_TEMPERATURE': return (TEMPS as readonly string[]).includes(String(a.value)) ? { type: 'SET_TEMPERATURE', value: String(a.value) } : null
    case 'ASSIGN_USER': return str(a.userId) ? { type: 'ASSIGN_USER', userId: str(a.userId) } : null
    default: return null
  }
}

/** Normaliza a lista de regras (vinda do banco ou do PUT). */
export function sanitizeAutomations(input: unknown, now = new Date()): AutomationRule[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: AutomationRule[] = []
  for (const raw of input.slice(0, MAX_AUTOMATIONS)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = str(r.name, 80)
    const trigger = (AUTOMATION_TRIGGERS as readonly string[]).includes(String(r.trigger)) ? (String(r.trigger) as AutomationTrigger) : null
    const actions = (Array.isArray(r.actions) ? r.actions : [])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map(sanitizeAction).filter((a): a is AutomationAction => !!a)
      .slice(0, MAX_ACTIONS_PER_RULE)
    if (!name || !trigger || actions.length === 0) continue
    let id = str(r.id, 40)
    if (!id || id.startsWith('new-') || seen.has(id)) id = `auto-${now.getTime().toString(36)}-${out.length}`
    seen.add(id)
    const c = (r.conditions && typeof r.conditions === 'object' ? r.conditions : {}) as Record<string, unknown>
    const conditions: AutomationConditions = {
      ...(str(c.pipelineId) ? { pipelineId: str(c.pipelineId) } : {}),
      ...(trigger === 'STAGE_ENTERED' && str(c.stageId) ? { stageId: str(c.stageId) } : {}),
      ...(trigger === 'STAGE_ENTERED' && str(c.statusCode) ? { statusCode: str(c.statusCode) } : {}),
      ...(strList(c.sources).length ? { sources: strList(c.sources).map((s) => s.toUpperCase()) } : {}),
      ...(strList(c.leadTypes).length ? { leadTypes: strList(c.leadTypes) } : {}),
      ...(strList(c.temperatures).length ? { temperatures: strList(c.temperatures) } : {}),
    }
    const hours = Number(r.hours)
    const createdAt = typeof r.createdAt === 'string' && !Number.isNaN(Date.parse(r.createdAt)) ? r.createdAt : now.toISOString()
    out.push({
      id, name, active: r.active === undefined ? true : Boolean(r.active), trigger,
      hours: trigger === 'NO_CONTACT' ? (Number.isFinite(hours) ? Math.min(24 * 90, Math.max(1, Math.round(hours))) : 24) : 0,
      conditions, actions, createdAt,
    })
  }
  return out
}

/** A regra vale para este evento? (sem I/O) */
export function ruleMatches(rule: AutomationRule, event: AutomationEvent): boolean {
  if (!rule.active || rule.trigger !== event.trigger) return false
  const c = rule.conditions
  const l = event.lead
  if (c.pipelineId && c.pipelineId !== l.pipelineId) return false
  if (c.stageId && c.stageId !== l.stageId) return false
  if (c.statusCode && c.statusCode !== l.status) return false
  if (c.sources?.length && !c.sources.includes(String(l.source ?? '').toUpperCase())) return false
  if (c.leadTypes?.length && !(l.leadType && c.leadTypes.includes(l.leadType))) return false
  if (c.temperatures?.length && !(l.temperature && c.temperatures.includes(l.temperature))) return false
  return true
}

export function matchingRules(rules: AutomationRule[], event: AutomationEvent): AutomationRule[] {
  return rules.filter((r) => ruleMatches(r, event))
}

/** Marcas de execução em metadata.automations: { [ruleId]: referência já processada }. */
export function readAutomationMarks(metadata: unknown): Record<string, string> {
  const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
  const a = m.automations && typeof m.automations === 'object' ? (m.automations as Record<string, unknown>) : {}
  return Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === 'string')) as Record<string, string>
}

/** Descrição curta de uma ação (lista de regras e auditoria). */
export function describeAction(a: AutomationAction): string {
  switch (a.type) {
    case 'CREATE_TASK': return `Criar tarefa "${a.title}"${a.dueInHours ? ` (em ${a.dueInHours}h)` : ''}`
    case 'NOTIFY': return a.target === 'MANAGERS' ? 'Avisar gestores' : 'Avisar responsável'
    case 'ADD_TAG': return 'Aplicar etiqueta'
    case 'SET_TEMPERATURE': return 'Definir temperatura'
    case 'ASSIGN_USER': return 'Atribuir responsável'
  }
}
