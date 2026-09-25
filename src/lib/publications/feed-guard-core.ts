// =============================================================================
// Proteção de feed. PURO (testado).
// Portais que CONSULTAM um feed interpretam item ausente como "remover".
// Uma falha interna (banco fora, consulta vazia por erro) nunca pode virar um
// feed vazio — isso tiraria o estoque inteiro do ar. Regras:
//   • geração falhou → último feed bom (até 24 h) ou 503 (portal tenta depois)
//   • 0 itens com estoque visível ou feed anterior cheio → suspeito
//   • queda brusca (> 60% com 10+ itens antes) → suspeito
//   Suspeito → último feed bom; sem feed bom recente → 503.
// =============================================================================

export interface FeedSnapshot { exported: number; at: Date }
export interface FeedDecisionInput {
  generated: { ok: true; exported: number } | { ok: false; error: string }
  lastGood: FeedSnapshot | null
  /** Contagem independente do estoque visível (outra consulta). */
  visibleStock: number | null
  now?: Date
}
export type FeedDecision =
  | { serve: 'CURRENT'; reason: string }
  | { serve: 'LAST_GOOD'; reason: string }
  | { serve: 'UNAVAILABLE'; reason: string }

export const LAST_GOOD_MAX_AGE_MS = 24 * 3_600_000
export const DROP_RATIO = 0.6
export const DROP_MIN_BASE = 10

export function decideFeed(i: FeedDecisionInput): FeedDecision {
  const now = i.now ?? new Date()
  const lastGoodUsable = i.lastGood && now.getTime() - i.lastGood.at.getTime() <= LAST_GOOD_MAX_AGE_MS && i.lastGood.exported > 0
  const fallback = (reason: string): FeedDecision => (lastGoodUsable ? { serve: 'LAST_GOOD', reason } : { serve: 'UNAVAILABLE', reason })

  if (!i.generated.ok) return fallback(`Falha ao gerar o feed: ${i.generated.error}`)
  const n = i.generated.exported
  if (n === 0) {
    if ((i.visibleStock ?? 0) > 0) return fallback('Feed vazio com estoque visível — possível falha interna.')
    if (i.visibleStock == null) return fallback('Feed vazio e contagem do estoque indisponível.')
    if (i.lastGood && i.lastGood.exported >= DROP_MIN_BASE && now.getTime() - i.lastGood.at.getTime() < 3_600_000) {
      return fallback('Estoque zerou de uma hora para outra — aguardando confirmação.')
    }
    return { serve: 'CURRENT', reason: 'Estoque realmente vazio.' }
  }
  if (i.lastGood && i.lastGood.exported >= DROP_MIN_BASE && n < i.lastGood.exported * (1 - DROP_RATIO) && lastGoodUsable) {
    return { serve: 'LAST_GOOD', reason: `Queda brusca (${i.lastGood.exported} → ${n}) — mantido o feed anterior até confirmar.` }
  }
  return { serve: 'CURRENT', reason: 'OK' }
}
