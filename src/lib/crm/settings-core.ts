// =============================================================================
// CRM — listas configuráveis por loja (Central de Configurações, Fase A).
// Núcleo PURO (client-safe, testado): tipos, defaults, sanitização e rótulos.
//   • Temperaturas: nome/cor/ativa por loja; os CÓDIGOS são fixos (BOILING…COLD)
//     e UNCLASSIFIED é sempre o estado "sem temperatura".
//   • Tipos de lead: lista livre (id estável); o lead guarda metadata.leadType.
//   • Origens: rótulo por código de `source` (códigos do sistema + próprios).
//   • Motivos de encerramento: por desfecho (perdido/desqualificado/reciclado).
// =============================================================================

import { sanitizeAutomations, type AutomationRule } from './automations-core'

export const TEMPERATURE_CODES = ['BOILING', 'HOT', 'WARM', 'COLD'] as const
export type TemperatureCode = (typeof TEMPERATURE_CODES)[number]
export const CLOSE_OUTCOMES = ['LOST', 'DISCARDED', 'RECYCLED'] as const
export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number]

export interface TemperatureCfg { value: TemperatureCode; label: string; color: string; active: boolean }
export interface LeadTypeCfg { id: string; label: string; color: string; active: boolean }
export interface SourceCfg { code: string; label: string; active: boolean; system: boolean }
export interface CloseReasonCfg { id: string; label: string; outcome: CloseOutcome; active: boolean }

// Fase B — regras de atendimento.
export interface RequiredFieldsCfg { onCreate: string[]; onConvert: string[] }
export interface SlaCfg {
  enabled: boolean
  firstContactMinutes: number   // prazo p/ o 1º contato após a criação
  noContactHours: number        // alerta quando o lead fica esse tempo sem contato
  createFollowUpTask: boolean   // cria tarefa de follow-up no alerta de "sem contato"
  escalateToManagers: boolean   // avisa gestores (resumo) quando houver estouro
  enabledAt?: string            // ISO de quando foi ligado: só alerta estouros a partir daí
}
export interface DistributionCfg {
  autoAssignNew: boolean        // lead criado no CRM sem responsável → motor de distribuição
  runSdrInTick: boolean         // roda SLA+distribuição da Mesa SDR no job periódico
}

export interface CrmSettings {
  temperatures: TemperatureCfg[]
  leadTypes: LeadTypeCfg[]
  sources: SourceCfg[]
  closeReasons: CloseReasonCfg[]
  requiredFields: RequiredFieldsCfg
  sla: SlaCfg
  distribution: DistributionCfg
  automations: AutomationRule[]
}

/** Campos do lead que a loja pode exigir no cadastro / na conversão. */
export const LEAD_FIELDS = [
  { key: 'name', label: 'Nome' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'leadType', label: 'Tipo de lead' },
  { key: 'vehicleId', label: 'Veículo de interesse' },
  { key: 'assignedToUserId', label: 'Responsável' },
] as const
const LEAD_FIELD_KEYS = new Set<string>(LEAD_FIELDS.map((f) => f.key))

/** Códigos de origem gravados pelas integrações/fluxos do sistema. */
export const SYSTEM_SOURCES: { code: string; label: string }[] = [
  { code: 'MANUAL', label: 'Manual' },
  { code: 'CRM_MANUAL', label: 'CRM manual' },
  { code: 'AUTOCONF', label: 'AutoConf' },
  { code: 'FILA_ATENDIMENTO', label: 'Fila de atendimento' },
  { code: 'CLIENTE_NA_LOJA', label: 'Cliente na loja' },
]

const LOST_REASONS = ['Sem resposta', 'Sem interesse', 'Preço', 'Avaliação da troca', 'Financiamento não aprovado', 'Entrada insuficiente', 'Veículo vendido', 'Veículo indisponível', 'Comprou no concorrente', 'Desistiu', 'Documentação', 'Prazo', 'Localização', 'Atendimento', 'Outro']
const DISCARDED_REASONS = ['Número inválido', 'Contato duplicado', 'Teste / spam', 'Fora do perfil', 'Outro']
const RECYCLED_REASONS = ['Compra futura', 'Aguardando crédito', 'Aguardando venda do usado', 'Outro']

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item'

export function defaultCrmSettings(): CrmSettings {
  return {
    temperatures: [
      { value: 'BOILING', label: 'Fervendo', color: '#dc2626', active: true },
      { value: 'HOT', label: 'Quente', color: '#f97316', active: true },
      { value: 'WARM', label: 'Morno', color: '#f59e0b', active: true },
      { value: 'COLD', label: 'Frio', color: '#3b82f6', active: true },
    ],
    leadTypes: [
      { id: 'compra', label: 'Compra de veículo', color: '#10b981', active: true },
      { id: 'troca', label: 'Troca', color: '#0ea5e9', active: true },
      { id: 'venda', label: 'Venda do usado', color: '#a855f7', active: true },
      { id: 'consignacao', label: 'Consignação', color: '#f59e0b', active: true },
      { id: 'financiamento', label: 'Financiamento', color: '#6366f1', active: true },
    ],
    sources: [
      ...SYSTEM_SOURCES.map((s) => ({ ...s, active: true, system: true })),
      // Origens que já existiam no filtro da lista de leads — removíveis.
      ...[['SDR', 'SDR'], ['WHATSAPP', 'WhatsApp'], ['WEBSITE', 'Website'], ['WEBMOTORS', 'Webmotors'], ['EMAIL', 'E-mail']]
        .map(([code, label]) => ({ code, label, active: true, system: false })),
    ],
    closeReasons: [
      ...LOST_REASONS.map((label) => ({ id: `lost-${slug(label)}`, label, outcome: 'LOST' as const, active: true })),
      ...DISCARDED_REASONS.map((label) => ({ id: `discarded-${slug(label)}`, label, outcome: 'DISCARDED' as const, active: true })),
      ...RECYCLED_REASONS.map((label) => ({ id: `recycled-${slug(label)}`, label, outcome: 'RECYCLED' as const, active: true })),
    ],
    // Defaults = comportamento atual (nada exigido, SLA e distribuição desligados).
    requiredFields: { onCreate: [], onConvert: [] },
    sla: { enabled: false, firstContactMinutes: 30, noContactHours: 48, createFollowUpTask: true, escalateToManagers: true },
    distribution: { autoAssignNew: false, runSdrInTick: false },
    automations: [],
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/
const str = (v: unknown, max = 60) => String(v ?? '').trim().slice(0, max)
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback)
const bool = (v: unknown, fallback = true) => (v === undefined ? fallback : Boolean(v))
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []

/**
 * Normaliza um objeto de configurações (vindo do banco ou do PUT). Seções
 * ausentes/inválidas caem no default; itens inválidos são descartados.
 */
export function sanitizeCrmSettings(input: unknown): CrmSettings {
  const d = defaultCrmSettings()
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  // Temperaturas: sempre os 4 códigos, na ordem fixa; só rótulo/cor/ativa mudam.
  const tIn = new Map(arr(b.temperatures).map((t) => [String(t.value), t]))
  const temperatures = d.temperatures.map((def) => {
    const t = tIn.get(def.value)
    return t ? { value: def.value, label: str(t.label) || def.label, color: color(t.color, def.color), active: bool(t.active) } : def
  })

  const seen = new Set<string>()
  const uniqueId = (base: string) => { let id = base, i = 2; while (seen.has(id)) id = `${base}-${i++}`; seen.add(id); return id }

  const leadTypes = Array.isArray(b.leadTypes)
    ? arr(b.leadTypes).flatMap((t) => {
        const label = str(t.label)
        if (!label) return []
        return [{ id: uniqueId(str(t.id, 40) || slug(label)), label, color: color(t.color, '#6b7280'), active: bool(t.active) }]
      })
    : d.leadTypes

  // Origens: os códigos do sistema estão sempre presentes (podem ser renomeados/desativados).
  const sIn = Array.isArray(b.sources) ? arr(b.sources) : d.sources
  const sysCodes = new Set(SYSTEM_SOURCES.map((s) => s.code))
  const sources: SourceCfg[] = SYSTEM_SOURCES.map((sys) => {
    const s = sIn.find((x) => String(x.code) === sys.code)
    return { code: sys.code, label: (s && str(s.label)) || sys.label, active: s ? bool(s.active) : true, system: true }
  })
  for (const s of sIn) {
    const label = str(s.label)
    const code = (str(s.code, 40) || slug(label)).toUpperCase().replace(/[^A-Z0-9_]+/g, '_')
    if (!label || !code || sysCodes.has(code) || sources.some((x) => x.code === code)) continue
    sources.push({ code, label, active: bool(s.active), system: false })
  }

  seen.clear()
  const closeReasons = Array.isArray(b.closeReasons)
    ? arr(b.closeReasons).flatMap((r) => {
        const label = str(r.label, 80)
        const outcome = (CLOSE_OUTCOMES as readonly string[]).includes(String(r.outcome)) ? (String(r.outcome) as CloseOutcome) : null
        if (!label || !outcome) return []
        const rawId = str(r.id, 60)
        const id = rawId && !rawId.startsWith('new-') ? rawId : `${outcome.toLowerCase()}-${slug(label)}`
        return [{ id: uniqueId(id), label, outcome, active: bool(r.active) }]
      })
    : d.closeReasons

  const rf = (b.requiredFields && typeof b.requiredFields === 'object' ? b.requiredFields : {}) as Record<string, unknown>
  const fields = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((f): f is string => typeof f === 'string' && LEAD_FIELD_KEYS.has(f)))] : []
  const requiredFields = { onCreate: fields(rf.onCreate), onConvert: fields(rf.onConvert) }

  const sl = (b.sla && typeof b.sla === 'object' ? b.sla : {}) as Record<string, unknown>
  const int = (v: unknown, def: number, min: number, max: number) => {
    const n = Math.round(Number(v)); return Number.isFinite(n) && v !== null && v !== '' ? Math.min(max, Math.max(min, n)) : def
  }
  const sla = {
    enabled: bool(sl.enabled, d.sla.enabled),
    firstContactMinutes: int(sl.firstContactMinutes, d.sla.firstContactMinutes, 5, 7 * 24 * 60),
    noContactHours: int(sl.noContactHours, d.sla.noContactHours, 1, 60 * 24),
    createFollowUpTask: bool(sl.createFollowUpTask, d.sla.createFollowUpTask),
    escalateToManagers: bool(sl.escalateToManagers, d.sla.escalateToManagers),
    ...(typeof sl.enabledAt === 'string' && !Number.isNaN(Date.parse(sl.enabledAt)) ? { enabledAt: sl.enabledAt } : {}),
  }

  const di = (b.distribution && typeof b.distribution === 'object' ? b.distribution : {}) as Record<string, unknown>
  const distribution = { autoAssignNew: bool(di.autoAssignNew, false), runSdrInTick: bool(di.runSdrInTick, false) }

  return { temperatures, leadTypes, sources, closeReasons, requiredFields, sla, distribution, automations: sanitizeAutomations(b.automations) }
}

// ── Fase B: avaliadores puros ────────────────────────────────────────────────

export interface LeadFieldValues { name?: string | null; phone?: string | null; email?: string | null; leadType?: string | null; vehicleId?: string | null; assignedToUserId?: string | null }

/** Campos exigidos que estão vazios (na ordem de LEAD_FIELDS). */
export function missingLeadFields(required: string[], lead: LeadFieldValues): string[] {
  return LEAD_FIELDS.filter((f) => required.includes(f.key)).filter((f) => {
    const v = (lead as Record<string, unknown>)[f.key]
    return typeof v === 'string' ? !v.trim() : v == null
  }).map((f) => f.key)
}

export function fieldLabels(keys: string[]): string {
  return keys.map((k) => LEAD_FIELDS.find((f) => f.key === k)?.label ?? k).join(', ')
}

export const OPEN_LEAD_STATUSES = ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'RECYCLED'] as const

export interface SlaMarks { firstContactAlertedAt?: string; noContactAlertedFor?: string }
export interface SlaLead { status: string; createdAt: Date; lastContactAt: Date | null; marks: SlaMarks }
export interface SlaVerdict {
  firstContactLate: boolean      // passou do prazo do 1º contato
  noContactLate: boolean         // passou do limite sem contato
  noContactRef: string           // referência (ISO) do período sem contato
  alertFirstContact: boolean     // deve alertar agora (ainda não alertado)
  alertNoContact: boolean
}

/**
 * Situação de SLA de um lead. Alertas disparam uma vez por período e só para
 * estouros que aconteceram depois de o SLA ser ligado (sem avalanche do
 * histórico); os indicadores "Late" valem sempre (selo no Kanban).
 */
export function evaluateLeadSla(lead: SlaLead, cfg: SlaCfg, now: Date): SlaVerdict {
  const open = (OPEN_LEAD_STATUSES as readonly string[]).includes(lead.status)
  const ref = lead.lastContactAt ?? lead.createdAt
  const noContactRef = ref.toISOString()
  const firstDue = lead.createdAt.getTime() + cfg.firstContactMinutes * 60_000
  const noContactDue = ref.getTime() + cfg.noContactHours * 3_600_000
  const firstContactLate = open && !lead.lastContactAt && now.getTime() > firstDue
  const noContactLate = open && now.getTime() > noContactDue
  const since = cfg.enabledAt ? Date.parse(cfg.enabledAt) : -Infinity
  return {
    firstContactLate, noContactLate, noContactRef,
    alertFirstContact: cfg.enabled && firstContactLate && firstDue >= since && !lead.marks.firstContactAlertedAt,
    alertNoContact: cfg.enabled && noContactLate && noContactDue >= since && lead.marks.noContactAlertedFor !== noContactRef,
  }
}

export function readSlaMarks(metadata: unknown): SlaMarks {
  const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
  const s = m.sla && typeof m.sla === 'object' ? (m.sla as Record<string, unknown>) : {}
  return {
    ...(typeof s.firstContactAlertedAt === 'string' ? { firstContactAlertedAt: s.firstContactAlertedAt } : {}),
    ...(typeof s.noContactAlertedFor === 'string' ? { noContactAlertedFor: s.noContactAlertedFor } : {}),
  }
}

// ── Leitura (usada nas telas) ────────────────────────────────────────────────

export const UNCLASSIFIED_TEMPERATURE = { value: 'UNCLASSIFIED', label: 'Não classificado', color: '#9ca3af', active: true } as const

export function temperatureOf(s: CrmSettings, value: string | null | undefined) {
  return s.temperatures.find((t) => t.value === value) ?? UNCLASSIFIED_TEMPERATURE
}

export function sourceLabelOf(s: CrmSettings, code: string | null | undefined): string {
  const c = String(code ?? '').trim()
  if (!c) return 'Sem origem'
  return s.sources.find((x) => x.code === c.toUpperCase())?.label ?? c
}

export function leadTypeOf(s: CrmSettings, id: string | null | undefined): LeadTypeCfg | null {
  return id ? s.leadTypes.find((t) => t.id === id) ?? null : null
}

export function reasonsFor(s: CrmSettings, outcome: CloseOutcome): CloseReasonCfg[] {
  return s.closeReasons.filter((r) => r.active && r.outcome === outcome)
}

/** Tipo de lead guardado em MarketingLead.metadata.leadType. */
export function readLeadType(metadata: unknown): string | null {
  const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
  return typeof m.leadType === 'string' && m.leadType ? m.leadType : null
}
