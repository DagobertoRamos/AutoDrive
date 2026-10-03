// =============================================================================
// Tabela de reparos da avaliação — regras puras (testadas).
// Cada reparo (funilaria e pintura, martelinho, micro-pintura…) tem valor
// FIXO definido pela gerência; o avaliador só escolhe, não digita valor.
// `sections` vazia = vale para todas as seções.
// =============================================================================

export const EVAL_SECTIONS = [
  ['FRENTE', 'Frente'], ['DIREITA', 'Lateral direita'], ['TRASEIRA', 'Traseira'], ['ESQUERDA', 'Lateral esquerda'],
  ['INTERIOR', 'Interior'], ['TEST_DRIVE', 'Mecânica / test drive'],
] as const
export type EvalSection = (typeof EVAL_SECTIONS)[number][0]
const SECTION_SET = new Set<string>(EVAL_SECTIONS.map(([k]) => k))

export interface RepairOption {
  key: string
  label: string
  serviceType: string // EvaluationService.serviceType
  price: number
  sections: EvalSection[]
  active: boolean
  order: number
}

const BODY: EvalSection[] = ['FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA']

/** Ponto de partida — a gerência ajusta os valores em Configurações de avaliação. */
export const DEFAULT_REPAIRS: RepairOption[] = [
  { key: 'funilaria_pintura', label: 'Funilaria e pintura', serviceType: 'FUNILARIA', price: 600, sections: BODY, active: true, order: 10 },
  { key: 'pintura', label: 'Pintura', serviceType: 'PINTURA', price: 450, sections: BODY, active: true, order: 20 },
  { key: 'martelinho', label: 'Martelinho de ouro', serviceType: 'FUNILARIA', price: 250, sections: BODY, active: true, order: 30 },
  { key: 'micro_pintura', label: 'Micro-pintura', serviceType: 'PINTURA', price: 180, sections: BODY, active: true, order: 40 },
  { key: 'polimento', label: 'Polimento localizado', serviceType: 'POLIMENTO', price: 120, sections: BODY, active: true, order: 50 },
  { key: 'troca_peca', label: 'Troca de peça', serviceType: 'TROCA_PECA', price: 800, sections: [], active: true, order: 60 },
  { key: 'higienizacao', label: 'Higienização', serviceType: 'HIGIENIZACAO', price: 200, sections: ['INTERIOR'], active: true, order: 70 },
  { key: 'estofamento', label: 'Reparo de estofamento', serviceType: 'REPARO_TECIDO', price: 300, sections: ['INTERIOR'], active: true, order: 80 },
  { key: 'mecanica', label: 'Reparo mecânico', serviceType: 'OUTRO', price: 500, sections: ['TEST_DRIVE'], active: true, order: 90 },
]

const slug = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

/** Valida e normaliza a tabela enviada pela tela de configuração. */
export function normalizeRepairs(raw: unknown): { ok: true; data: RepairOption[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Tabela inválida.' }
  const out: RepairOption[] = []
  const keys = new Set<string>()
  for (const [i, r] of raw.entries()) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const label = String(o.label ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!label) return { ok: false, error: `Informe o nome do reparo (linha ${i + 1}).` }
    const price = Math.round(Number(o.price) * 100) / 100
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: `Valor inválido em "${label}".` }
    let key = String(o.key ?? '').trim() || slug(label)
    if (!key) key = `reparo_${i + 1}`
    if (keys.has(key)) key = `${key}_${i + 1}`
    keys.add(key)
    const sections = (Array.isArray(o.sections) ? o.sections : []).map(String).filter((s) => SECTION_SET.has(s)) as EvalSection[]
    out.push({ key, label, serviceType: String(o.serviceType ?? 'OUTRO').toUpperCase().slice(0, 30) || 'OUTRO', price, sections, active: o.active !== false, order: (i + 1) * 10 })
  }
  if (!out.some((r) => r.active)) return { ok: false, error: 'Deixe ao menos um reparo ativo.' }
  return { ok: true, data: out }
}

/** Reparos que o avaliador vê para um item da seção. */
export const repairsForSection = (repairs: RepairOption[], section: string) =>
  repairs.filter((r) => r.active && (r.sections.length === 0 || r.sections.includes(section as EvalSection)))

/** Valor do reparo: preço da tabela × quantidade de posições (ex.: 2 pneus). */
export const repairTotal = (price: number, positions: number) => Math.round(price * Math.max(1, positions) * 100) / 100

/** Diferenças entre duas versões da tabela (log de alterações). */
export function diffRepairs(before: RepairOption[], after: RepairOption[]): string[] {
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const b = new Map(before.map((r) => [r.key, r]))
  const a = new Map(after.map((r) => [r.key, r]))
  const out: string[] = []
  for (const r of after) {
    const old = b.get(r.key)
    if (!old) { out.push(`Incluído "${r.label}" (${brl(r.price)})`); continue }
    if (old.label !== r.label) out.push(`"${old.label}" renomeado para "${r.label}"`)
    if (old.price !== r.price) out.push(`"${r.label}": ${brl(old.price)} → ${brl(r.price)}`)
    if (old.active !== r.active) out.push(`"${r.label}" ${r.active ? 'ativado' : 'desativado'}`)
    if (old.sections.join() !== r.sections.join()) out.push(`"${r.label}": seções alteradas`)
  }
  for (const r of before) if (!a.has(r.key)) out.push(`Excluído "${r.label}"`)
  return out
}
