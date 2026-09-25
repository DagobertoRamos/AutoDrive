// =============================================================================
// De-para estoque → códigos do portal. PURO (testado).
// Regra: só casa sozinho quando o nome normalizado é IGUAL e único. Qualquer
// dúvida vira "REVISAR" com candidatos ordenados por semelhança — o sistema
// nunca troca a versão do carro calado para conseguir publicar.
// O código FIPE não substitui os identificadores próprios de cada portal.
// =============================================================================

export interface Candidate { id: string; label: string }

export function normalizeLabel(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Chave estável do valor no estoque (ex.: "FIAT|ARGO|DRIVE 1.0"). */
export function sourceKey(...parts: Array<string | number | null | undefined>): string {
  return parts.map((p) => normalizeLabel(p == null ? '' : String(p))).join('|')
}

/** Correspondência exata e única; senão null. */
export function exactMatch(label: string, candidates: Candidate[]): Candidate | null {
  const n = normalizeLabel(label)
  if (!n) return null
  const hits = candidates.filter((c) => normalizeLabel(c.label) === n)
  return hits.length === 1 ? hits[0] : null
}

function tokens(s: string): Set<string> { return new Set(normalizeLabel(s).split(' ').filter(Boolean)) }

/** Semelhança (Jaccard por palavras) — só para ORDENAR sugestões, nunca para decidir. */
export function similarity(a: string, b: string): number {
  const x = tokens(a); const y = tokens(b)
  if (!x.size || !y.size) return 0
  let inter = 0
  for (const t of x) if (y.has(t)) inter++
  return inter / (x.size + y.size - inter)
}

export function rankCandidates(label: string, candidates: Candidate[], limit = 10): Array<Candidate & { score: number }> {
  return candidates.map((c) => ({ ...c, score: Math.round(similarity(label, c.label) * 100) / 100 }))
    .filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Tabela fixa (sinônimos documentados) → candidato; ambíguo = null. */
export function mapBySynonyms(value: string | null | undefined, table: Record<string, string[]>, candidates: Candidate[]): Candidate | null {
  const n = normalizeLabel(value)
  if (!n) return null
  const ids = Object.entries(table).filter(([, syn]) => syn.map(normalizeLabel).includes(n)).map(([id]) => id)
  if (ids.length !== 1) return null
  return candidates.find((c) => c.id === ids[0]) ?? null
}
