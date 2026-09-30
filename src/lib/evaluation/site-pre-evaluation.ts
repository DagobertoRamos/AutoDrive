// =============================================================================
// Pré-avaliação pelo site ("Venda seu carro") — PURO (testado).
//
// O cliente segue um passo a passo de fotos no site; ao enviar, o sistema
// cadastra a avaliação no módulo de Avaliação com status LIBERADA (liberada
// automaticamente, sem gerente). Antes de o carro entrar em negociação, a
// gerência é OBRIGADA a conferir: enquanto `releasedByUserId` estiver vazio,
// `needsManagerReview` bloqueia o uso em compra/troca/consignação.
//
// As etapas abaixo são a fonte única: o formulário do site mostra na ordem,
// e o servidor usa as mesmas chaves para pôr cada foto na seção/item certo.
// =============================================================================

import { ITEMS, type SectionKey } from './catalog'

/** Marca de origem gravada em VehicleEvaluation.lookupSource. */
export const SITE_PRE_EVAL_SOURCE = 'SITE_PRE_AVALIACAO'

export interface PreEvalShot {
  key: string
  label: string
  /** Item do checklist que recebe a foto; null = foto geral da seção. */
  catalogKey: string | null
}

export interface PreEvalStep {
  key: string
  title: string
  hint: string
  section: SectionKey
  shots: PreEvalShot[]
  /** Item que recebe a avaria marcada nesta etapa (foto + descrição). */
  damageKey: string
  /** Etapa só vale se o carro tiver teto solar/panorâmico. */
  sunroof?: boolean
  /** Etapa dos pneus: pede a condição (bom / meia vida / trocar). */
  tires?: 'RIGHT' | 'LEFT'
}

export const PRE_EVAL_STEPS: PreEvalStep[] = [
  { key: 'painel', title: 'Painel ligado', hint: 'Com o carro ligado, fotografe o painel mostrando a quilometragem e as luzes.', section: 'INTERIOR',
    shots: [{ key: 'foto', label: 'Painel com o km', catalogKey: 'interior.painel_km' }], damageKey: 'interior.painel_km' },
  { key: 'interior', title: 'Interior', hint: 'Do banco de trás, enquadre o painel inteiro, o volante e os bancos da frente.', section: 'INTERIOR',
    shots: [{ key: 'foto', label: 'Interior visto do banco de trás', catalogKey: null }], damageKey: 'interior.recuperacao_interior' },
  { key: 'frente', title: 'Frente', hint: 'Afaste-se uns 3 metros e fotografe a frente inteira do carro.', section: 'FRENTE',
    shots: [{ key: 'foto', label: 'Frente do carro', catalogKey: null }], damageKey: 'frente.recuperacao_frente' },
  { key: 'motor', title: 'Motor', hint: 'Abra o capô e fotografe o motor de cima.', section: 'FRENTE',
    shots: [{ key: 'foto', label: 'Motor', catalogKey: 'frente.motor' }], damageKey: 'frente.motor' },
  { key: 'teto', title: 'Teto solar / panorâmico', hint: 'Com o teto solar aberto (ou a cortina do panorâmico recolhida), fotografe de dentro do carro.', section: 'FRENTE',
    shots: [{ key: 'foto', label: 'Teto solar aberto', catalogKey: 'frente.teto_solar' }], damageKey: 'frente.teto_solar', sunroof: true },
  { key: 'lateral_direita', title: 'Lateral direita', hint: 'Fotografe o lado direito inteiro, da frente até a traseira.', section: 'DIREITA',
    shots: [{ key: 'foto', label: 'Lateral direita', catalogKey: null }], damageKey: 'direita.recuperacao_direita' },
  { key: 'pneus_direitos', title: 'Pneus do lado direito', hint: 'Fotografe de perto os dois pneus do lado direito, mostrando a banda de rodagem.', section: 'DIREITA',
    shots: [
      { key: 'dianteiro', label: 'Pneu dianteiro direito', catalogKey: 'direita.pneu_dianteiro' },
      { key: 'traseiro', label: 'Pneu traseiro direito', catalogKey: 'direita.pneu_traseiro' },
    ], damageKey: 'direita.recuperacao_direita', tires: 'RIGHT' },
  { key: 'traseira', title: 'Traseira', hint: 'Afaste-se uns 3 metros e fotografe a traseira inteira.', section: 'TRASEIRA',
    shots: [{ key: 'foto', label: 'Traseira do carro', catalogKey: null }], damageKey: 'traseira.recuperacao_traseira' },
  { key: 'placa', title: 'Placa', hint: 'Fotografe a placa de perto, com as letras legíveis.', section: 'TRASEIRA',
    shots: [{ key: 'foto', label: 'Placa', catalogKey: null }], damageKey: 'traseira.recuperacao_traseira' },
  { key: 'porta_malas', title: 'Porta-malas aberto', hint: 'Abra o porta-malas e fotografe o compartimento.', section: 'TRASEIRA',
    shots: [{ key: 'foto', label: 'Porta-malas aberto', catalogKey: 'traseira.tampa_traseira' }], damageKey: 'traseira.tampa_traseira' },
  { key: 'estepe', title: 'Estepe', hint: 'Levante o assoalho do porta-malas e fotografe o estepe.', section: 'TRASEIRA',
    shots: [{ key: 'foto', label: 'Estepe', catalogKey: 'traseira.estepe' }], damageKey: 'traseira.estepe' },
  { key: 'lateral_esquerda', title: 'Lateral esquerda', hint: 'Fotografe o lado esquerdo inteiro, da frente até a traseira.', section: 'ESQUERDA',
    shots: [{ key: 'foto', label: 'Lateral esquerda', catalogKey: null }], damageKey: 'esquerda.recuperacao_esquerda' },
  { key: 'pneus_esquerdos', title: 'Pneus do lado esquerdo', hint: 'Fotografe de perto os dois pneus do lado esquerdo, mostrando a banda de rodagem.', section: 'ESQUERDA',
    shots: [
      { key: 'dianteiro', label: 'Pneu dianteiro esquerdo', catalogKey: 'esquerda.pneu_dianteiro' },
      { key: 'traseiro', label: 'Pneu traseiro esquerdo', catalogKey: 'esquerda.pneu_traseiro' },
    ], damageKey: 'esquerda.recuperacao_esquerda', tires: 'LEFT' },
]

export const DAMAGE_SHOT = 'avaria'
/** Fotos principais + uma de avaria por etapa. */
export const PRE_EVAL_MAX_PHOTOS = PRE_EVAL_STEPS.reduce((n, s) => n + s.shots.length + 1, 0)

export const TIRE_CONDITIONS = { BOM: 'Bons', MEIA_VIDA: 'Meia vida', TROCAR: 'Precisam trocar' } as const
export type TireCondition = keyof typeof TIRE_CONDITIONS
const TIRE_STATUS: Record<TireCondition, string> = { BOM: 'CONFORME', MEIA_VIDA: 'ATENCAO', TROCAR: 'REPARO' }

/** O que o cliente respondeu no passo a passo (vai junto do lead, em JSON). */
export interface PreEvalInspection {
  sunroof: boolean
  tires: { RIGHT: TireCondition | null; LEFT: TireCondition | null }
  /** Etapas com "tem avaria" marcado → descrição. */
  damages: Record<string, string>
}

export function activeSteps(sunroof: boolean): PreEvalStep[] {
  return PRE_EVAL_STEPS.filter((s) => !s.sunroof || sunroof)
}

export function findShot(stepKey: string, shotKey: string): { step: PreEvalStep; catalogKey: string | null; label: string } | null {
  const step = PRE_EVAL_STEPS.find((s) => s.key === stepKey)
  if (!step) return null
  if (shotKey === DAMAGE_SHOT) return { step, catalogKey: step.damageKey, label: `Avaria — ${step.title}` }
  const shot = step.shots.find((s) => s.key === shotKey)
  return shot ? { step, catalogKey: shot.catalogKey, label: shot.label } : null
}

/** Nome do arquivo gravado — também serve para não duplicar em reenvio. */
export const shotFileName = (stepKey: string, shotKey: string) => `site-${stepKey}-${shotKey}.webp`

type ParseInspection = { ok: true; value: PreEvalInspection } | { ok: false; error: string }

/** Valida o que veio do navegador (nunca confiar no cliente). */
export function parseInspection(raw: unknown): ParseInspection {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const sunroof = b.sunroof === true
  const t = (b.tires && typeof b.tires === 'object' ? b.tires : {}) as Record<string, unknown>
  const tire = (v: unknown): TireCondition | null => (typeof v === 'string' && v in TIRE_CONDITIONS ? (v as TireCondition) : null)
  const tires = { RIGHT: tire(t.RIGHT), LEFT: tire(t.LEFT) }
  if (!tires.RIGHT || !tires.LEFT) return { ok: false, error: 'Informe a condição dos pneus.' }
  const d = (b.damages && typeof b.damages === 'object' ? b.damages : {}) as Record<string, unknown>
  const damages: Record<string, string> = {}
  for (const step of activeSteps(sunroof)) {
    if (!(step.key in d)) continue
    const text = String(d[step.key] ?? '').trim().slice(0, 500)
    if (text.length < 3) return { ok: false, error: `Descreva a avaria marcada em "${step.title}".` }
    damages[step.key] = text
  }
  return { ok: true, value: { sunroof, tires, damages } }
}

export interface PreEvalItemRow { section: SectionKey; catalogKey: string; name: string; status: string; notes: string }

const SEVERITY: Record<string, number> = { NA: 0, CONFORME: 1, ATENCAO: 2, REPARO: 3 }

function catalogName(section: SectionKey, key: string): string {
  return ITEMS[section]?.find((i) => i.key === key)?.name ?? key
}

/**
 * Itens do checklist preenchidos a partir das respostas do cliente. Tudo que o
 * cliente não viu (test-drive, bancos, faróis…) fica para o avaliador — o
 * checklist completo é semeado quando a gerência abre a avaliação.
 */
export function buildPreEvalItems(insp: PreEvalInspection): PreEvalItemRow[] {
  const rows = new Map<string, PreEvalItemRow>()
  const put = (section: SectionKey, key: string, status: string, note: string) => {
    const cur = rows.get(key)
    if (!cur) { rows.set(key, { section, catalogKey: key, name: catalogName(section, key), status, notes: note }); return }
    if ((SEVERITY[status] ?? 0) > (SEVERITY[cur.status] ?? 0)) cur.status = status
    cur.notes = [cur.notes, note].filter(Boolean).join('\n')
  }
  for (const step of PRE_EVAL_STEPS) {
    if (step.sunroof && !insp.sunroof) { put(step.section, step.damageKey, 'NA', 'Cliente informou que o carro não tem teto solar.'); continue }
    for (const shot of step.shots) {
      if (!shot.catalogKey) continue
      const cond = step.tires ? insp.tires[step.tires] : null
      if (cond) put(step.section, shot.catalogKey, TIRE_STATUS[cond], `Condição informada pelo cliente: ${TIRE_CONDITIONS[cond]}.`)
      else put(step.section, shot.catalogKey, 'CONFORME', 'Foto enviada pelo cliente (pré-avaliação do site).')
    }
    const damage = insp.damages[step.key]
    if (damage) put(step.section, step.damageKey, 'ATENCAO', `Avaria informada pelo cliente (${step.title}): ${damage}`)
  }
  return [...rows.values()]
}

/** Linhas para o texto do lead no CRM. */
export function inspectionSummary(insp: PreEvalInspection): string {
  const damages = activeSteps(insp.sunroof).filter((s) => insp.damages[s.key]).map((s) => `• ${s.title}: ${insp.damages[s.key]}`)
  return [
    `Teto solar/panorâmico: ${insp.sunroof ? 'sim' : 'não'}`,
    `Pneus: direitos ${insp.tires.RIGHT ? TIRE_CONDITIONS[insp.tires.RIGHT] : '—'}, esquerdos ${insp.tires.LEFT ? TIRE_CONDITIONS[insp.tires.LEFT] : '—'}`,
    damages.length ? `Avarias informadas:\n${damages.join('\n')}` : 'Avarias informadas: nenhuma',
  ].join('\n')
}

/** "2020/2021" → { fabricação 2020, modelo 2021 }; "2020" → os dois. */
export function parseYears(v: string | undefined): { manufactureYear: number | null; modelYear: number | null } {
  const ys = String(v ?? '').match(/\d{4}/g)?.map(Number).filter((y) => y >= 1950 && y <= 2100) ?? []
  if (!ys.length) return { manufactureYear: null, modelYear: null }
  return { manufactureYear: ys[0], modelYear: ys[1] ?? ys[0] }
}

/** "R$ 45.900,50" → 45900.5 */
export function parseBrl(v: string | undefined): number | null {
  const s = String(v ?? '').replace(/[^\d,]/g, '').replace(',', '.')
  const n = Number(s)
  return s && Number.isFinite(n) && n > 0 ? n : null
}

export function parseKm(v: string | undefined): number | null {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 7)
  return d ? Number(d) : null
}

export function intentionFromGoal(goal: string | undefined): 'COMPRA' | 'TROCA' | 'APENAS_AVALIACAO' {
  if (goal === 'Vender') return 'COMPRA'
  if (goal?.startsWith('Trocar')) return 'TROCA'
  return 'APENAS_AVALIACAO'
}

/**
 * Pré-avaliação do site ainda sem conferência da gerência? (liberada pelo
 * sistema, sem gerente). Enquanto for true, o carro NÃO entra em negociação.
 */
export function needsManagerReview(ev: { lookupSource?: string | null; releasedByUserId?: string | null } | null | undefined): boolean {
  return !!ev && ev.lookupSource === SITE_PRE_EVAL_SOURCE && !ev.releasedByUserId
}

export const MANAGER_REVIEW_REASON = 'Pré-avaliação enviada pelo site: a gerência precisa conferir fotos e valores antes de negociar.'
