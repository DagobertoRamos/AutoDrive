// =============================================================================
// dashboard/attention-core.ts — regras PURAS da central "Precisa da sua atenção".
//
// Cada módulo informa CONTAGENS reais (nunca números inventados); aqui só se
// decide severidade, agrupamento e ordem. Sem acesso ao banco → testável.
// =============================================================================

import type { Module } from '@/lib/permissions'

/** Nível do alerta (do mais grave ao mais leve). */
export type AttentionSeverity = 'CRITICO' | 'IMPORTANTE' | 'ATENCAO' | 'INFO'

/** Em que "gaveta" o item aparece. */
export type AttentionBucket = 'CRITICAS' | 'ATRASADAS' | 'HOJE' | 'PROXIMAS' | 'AGUARDANDO_TERCEIROS'

export type AttentionArea =
  | 'comercial'
  | 'crm'
  | 'pendencias'
  | 'financeiro'
  | 'fi'
  | 'documentacao'
  | 'estoque'
  | 'preparacao'
  | 'publicacoes'
  | 'posvenda'

export interface AttentionItem {
  /** Chave estável (dedupe): mesma origem nunca aparece duas vezes. */
  id: string
  area: AttentionArea
  severity: AttentionSeverity
  bucket: AttentionBucket
  title: string
  /** Quantidade real de registros por trás do item. */
  count: number
  /** Valor monetário envolvido (quando faz sentido e o colaborador pode ver). */
  amount?: number | null
  helper?: string
  /** Drill-down: lista exata dos registros. */
  href: string
}

export interface AttentionSummary {
  total: number
  bySeverity: Record<AttentionSeverity, number>
  byBucket: Record<AttentionBucket, number>
  items: AttentionItem[]
}

/** Definição declarativa: o que o item exige para aparecer. */
export interface AttentionRule {
  id: string
  area: AttentionArea
  /** Basta UM destes módulos liberado para o colaborador. */
  requires: Module[]
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { CRITICO: 0, IMPORTANTE: 1, ATENCAO: 2, INFO: 3 }
const BUCKET_ORDER: Record<AttentionBucket, number> = {
  CRITICAS: 0,
  ATRASADAS: 1,
  HOJE: 2,
  AGUARDANDO_TERCEIROS: 3,
  PROXIMAS: 4,
}

export const SEVERITY_LABEL: Record<AttentionSeverity, string> = {
  CRITICO: 'Crítico',
  IMPORTANTE: 'Importante',
  ATENCAO: 'Atenção',
  INFO: 'Informativo',
}

export const BUCKET_LABEL: Record<AttentionBucket, string> = {
  CRITICAS: 'Críticas',
  ATRASADAS: 'Atrasadas',
  HOJE: 'Para hoje',
  PROXIMAS: 'Próximas',
  AGUARDANDO_TERCEIROS: 'Aguardando terceiros',
}

/**
 * Severidade por SLA: proporção do tempo decorrido sobre o prazo.
 *  < 50%  → INFO · 50–100% → ATENCAO · 100–200% → IMPORTANTE · > 200% → CRITICO
 * Sinalização progressiva, sem gritar logo de cara.
 */
export function severityFromSla(elapsedMs: number, slaMs: number): AttentionSeverity {
  if (!(slaMs > 0) || !(elapsedMs >= 0)) return 'INFO'
  const ratio = elapsedMs / slaMs
  if (ratio > 2) return 'CRITICO'
  if (ratio >= 1) return 'IMPORTANTE'
  if (ratio >= 0.5) return 'ATENCAO'
  return 'INFO'
}

/** Junta itens: descarta zerados, deduplica por id (soma), ordena por gravidade. */
export function summarizeAttention(items: AttentionItem[], limit = 12): AttentionSummary {
  const merged = new Map<string, AttentionItem>()
  for (const it of items) {
    if (!it || !(it.count > 0)) continue
    const prev = merged.get(it.id)
    if (!prev) {
      merged.set(it.id, { ...it })
      continue
    }
    prev.count += it.count
    if (it.amount != null) prev.amount = (prev.amount ?? 0) + it.amount
    if (SEVERITY_ORDER[it.severity] < SEVERITY_ORDER[prev.severity]) prev.severity = it.severity
  }
  const all = [...merged.values()].sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] ||
    b.count - a.count,
  )

  const bySeverity: Record<AttentionSeverity, number> = { CRITICO: 0, IMPORTANTE: 0, ATENCAO: 0, INFO: 0 }
  const byBucket: Record<AttentionBucket, number> = { CRITICAS: 0, ATRASADAS: 0, HOJE: 0, PROXIMAS: 0, AGUARDANDO_TERCEIROS: 0 }
  for (const it of all) {
    bySeverity[it.severity] += it.count
    byBucket[it.bucket] += it.count
  }
  return {
    total: all.reduce((sum, it) => sum + it.count, 0),
    bySeverity,
    byBucket,
    items: all.slice(0, limit),
  }
}

/** Frase objetiva para o topo do dashboard (sem IA, só dados reais). */
export function attentionHeadline(summary: AttentionSummary): string {
  if (summary.total === 0) return 'Tudo em dia. Nenhum item precisa da sua atenção agora.'
  const n = summary.total
  return n === 1 ? '1 item precisa da sua atenção' : `${n} itens precisam da sua atenção`
}
