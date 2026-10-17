// =============================================================================
// Casamento de marca/modelo/ano com o catálogo FIPE (Parallelum). Puro — usado
// pela tela de avaliação (etapa Veículo) e pelo servidor (busca automática da
// FIPE de avaliações que entraram sem ela).
// =============================================================================

// ── Normalização de marca para casamento com catálogo FIPE ────────────────────
// A API Placas pode trazer "VW", "VW - VolksWagen", "M.BENZ", etc. — o catálogo
// FIPE usa o nome canônico ("Volkswagen", "Mercedes-Benz"). Esta tabela mapeia
// os apelidos comuns para o canônico antes de comparar.
const BRAND_ALIAS: Record<string, string> = {
  'VW':        'VOLKSWAGEN',
  'VOLKS':     'VOLKSWAGEN',
  'GM':        'CHEVROLET',
  'MBENZ':     'MERCEDESBENZ',
  'M BENZ':    'MERCEDESBENZ',
  'M.BENZ':    'MERCEDESBENZ',
  'MERCEDES':  'MERCEDESBENZ',
  'CITROEN':   'CITROEN',
  'CITROËN':   'CITROEN',
  'PEUGEOT':   'PEUGEOT',
}
export function normalizeBrandName(s: string | undefined | null): string {
  if (!s) return ''
  const n = String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Remove sufixos depois de hífen ("VW - VOLKSWAGEN" → "VOLKSWAGEN" via alias da 1ª parte)
  const parts = n.split(/\s*-\s*/)
  for (const p of parts) {
    const compact = p.replace(/[^A-Z0-9]/g, '')
    if (BRAND_ALIAS[compact] || BRAND_ALIAS[p.trim()]) return BRAND_ALIAS[compact] || BRAND_ALIAS[p.trim()]
  }
  // Caso geral: pega a parte mais longa e remove pontuação
  const best = parts.reduce((a, b) => (b.length > a.length ? b : a), '')
  const compact = best.replace(/[^A-Z0-9]/g, '')
  return BRAND_ALIAS[compact] ?? compact
}
export function normalizeModelName(s: string | undefined | null): string {
  if (!s) return ''
  return String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '')
}

// Tokeniza um nome de veículo em palavras significativas para matching fuzzy.
// "FIT LX 1.4 16V FLEX" → ['FIT', 'LX', '14', '16V', 'FLEX']
// Filtra stop-words e pedaços muito curtos pra evitar match falso.
const STOP_WORDS = new Set(['DE', 'DA', 'DO', 'COM', 'P', 'V', 'A', 'O', 'E'])
export function tokenizeVehicleName(s: string | undefined | null): string[] {
  if (!s) return []
  return String(s)
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[\s\-\/\.\,\(\)]+/)
    .map((t) => t.replace(/[^A-Z0-9]/g, ''))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
}

/**
 * Faz o melhor match de um modelo da API contra a lista FIPE.
 * Estratégia: tokeniza ambos, conta quantos tokens do TARGET aparecem no
 * candidato. Maior score ganha. Empate é desempatado por menor diferença
 * no comprimento total (modelo mais "enxuto" tipicamente é o certo).
 *
 * Exemplo: target "FIT LX FLEX" (tokens FIT/LX/FLEX) vs candidatos:
 *   - "FIT LX 1.4 16V FLEX MEC."     → score 3, len 27
 *   - "FIT EX 1.5 16V FLEX AUT."     → score 2, len 27
 *   - "FIT TWIST 1.5 16V FLEX AUT."  → score 2, len 28
 * Vence o primeiro (FIT LX 1.4 16V FLEX MEC.).
 */
export function bestFipeMatch<T extends { name: string }>(
  list: T[],
  target: string | undefined | null,
  modelYearHint?: number | null,
): T | undefined {
  if (!list.length || !target) return undefined
  const tTokens = new Set(tokenizeVehicleName(target))
  if (tTokens.size === 0) return undefined
  let best: { item: T; score: number; len: number; yearMatch: number } | null = null
  for (const item of list) {
    const cTokens = tokenizeVehicleName(item.name)
    let score = 0
    for (const t of cTokens) if (tTokens.has(t)) score++
    if (score === 0) continue
    const len = item.name.length
    // Bônus se o nome do candidato menciona o ano modelo (alguns retornos da
    // FIPE incluem ano na descrição)
    const yearMatch = modelYearHint && item.name.includes(String(modelYearHint)) ? 1 : 0
    if (
      !best ||
      score > best.score ||
      (score === best.score && yearMatch > best.yearMatch) ||
      (score === best.score && yearMatch === best.yearMatch && len < best.len)
    ) {
      best = { item, score, len, yearMatch }
    }
  }
  return best?.item
}


/**
 * Candidatos empatados no melhor score — quando há mais de um, a versão é
 * ambígua e o usuário escolhe. Lista vazia = nada casou.
 */
export function topFipeMatches<T extends { name: string }>(
  list: T[],
  target: string | undefined | null,
  max = 8,
): T[] {
  if (!list.length || !target) return []
  const tTokens = new Set(tokenizeVehicleName(target))
  if (tTokens.size === 0) return []
  const scored = list
    .map((item) => {
      let score = 0
      for (const t of tokenizeVehicleName(item.name)) if (tTokens.has(t)) score++
      return { item, score }
    })
    .filter((x) => x.score > 0)
  if (!scored.length) return []
  const top = Math.max(...scored.map((x) => x.score))
  return scored
    .filter((x) => x.score === top)
    .sort((a, b) => a.item.name.length - b.item.name.length)
    .slice(0, max)
    .map((x) => x.item)
}

// ── Ano/combustível FIPE ─────────────────────────────────────────────────────
// A FIPE lista cada modelo por "ano-combustível": { code: '2013-5', name: '2013 Flex' }.

export interface FipeYearOption { code: string; name: string }

function fuelKey(s: string | null | undefined): string {
  const n = String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/FLEX|ALCOOL\/GASOLINA|GASOLINA\/ALCOOL/.test(n)) return 'FLEX'
  if (/DIESEL/.test(n)) return 'DIESEL'
  if (/ELETR/.test(n)) return 'ELETRICO'
  if (/HIBRID/.test(n)) return 'HIBRIDO'
  if (/ALCOOL|ETANOL/.test(n)) return 'ALCOOL'
  if (/GASOLINA/.test(n)) return 'GASOLINA'
  return ''
}

/**
 * Escolhe o ano FIPE do carro. Filtra pelo ano modelo; se sobrar mais de uma
 * opção, desempata pelo combustível. `pick` vem preenchido só quando a escolha
 * é inequívoca — senão `options` traz o que o usuário precisa escolher.
 */
export function pickFipeYear(
  years: FipeYearOption[],
  modelYear: number | null | undefined,
  fuel?: string | null,
): { pick: FipeYearOption | null; options: FipeYearOption[] } {
  if (!years.length || !modelYear) return { pick: null, options: [] }
  const sameYear = years.filter((y) => y.code.split('-')[0] === String(modelYear))
  if (sameYear.length === 1) return { pick: sameYear[0], options: sameYear }
  if (!sameYear.length) return { pick: null, options: [] }
  const fk = fuelKey(fuel)
  if (fk) {
    const byFuel = sameYear.filter((y) => fuelKey(y.name) === fk)
    if (byFuel.length === 1) return { pick: byFuel[0], options: sameYear }
  }
  return { pick: null, options: sameYear }
}

/** "R$ 32.450,00" → 32450 */
export function parseFipePrice(price: string | null | undefined): number | null {
  if (!price) return null
  const n = Number(String(price).replace(/[^\d,]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}
