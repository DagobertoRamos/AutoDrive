// =============================================================================
// Seletor FIPE do site (Venda seu carro) — regras PURAS (testadas).
//
// A FIPE junta modelo e versão num nome só ("ARGO DRIVE 1.3 8V Flex").
// Para o cliente escolher Marca → Modelo → Versão → Ano, agrupamos os
// modelos FIPE pelo nome-base (primeira palavra, ou duas quando a primeira
// é um prefixo como "Grand", "Range", "Space").
// =============================================================================

export interface FipeOption { code: string; name: string }

export interface ModelGroup {
  key:      string        // chave normalizada (maiúsculas)
  label:    string        // como aparece no menu
  versions: FipeOption[]  // modelos FIPE do grupo (= versões)
}

/** Primeira palavra que sozinha não identifica o modelo. */
const TWO_WORD_PREFIX = new Set([
  'GRAND', 'RANGE', 'SPACE', 'LAND', 'SANTA', 'NEW', 'NOVA', 'NOVO', 'NEON', 'PALIO', 'SIENA', 'CROSS',
  'MERCEDES', 'SERIE', 'SÉRIE', 'CLASSE', 'MODEL', 'GOLF', 'SANDERO', 'LOGAN', 'DOBLO', 'STRADA',
])
/** Segunda palavra que conta como parte do nome (ex.: "Palio Weekend", "Golf Variant"). */
const SECOND_WORD_OK: Record<string, Set<string>> = {
  PALIO:   new Set(['WEEKEND', 'ADVENTURE']),
  SIENA:   new Set(['EL']),
  GOLF:    new Set(['VARIANT']),
  SANDERO: new Set(['STEPWAY']),
  LOGAN:   new Set(['EXPRESSION']),
  DOBLO:   new Set(['CARGO']),
  STRADA:  new Set(['ADVENTURE']),
  CROSS:   new Set(['FOX', 'UP!', 'LANDER']),
}

const clean = (s: string) => s.replace(/[.,]+$/, '')

export function modelBase(name: string): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const first = clean(words[0])
  const up = first.toUpperCase()
  const second = words[1] ? clean(words[1]) : ''
  if (second && TWO_WORD_PREFIX.has(up)) {
    const only = SECOND_WORD_OK[up]
    // Prefixo "genérico" (Grand, Range…): sempre junta; com lista, só se a 2ª palavra constar.
    // A 2ª palavra não pode ser motorização/versão (tem dígito).
    if (!/\d/.test(second) && (!only || only.has(second.toUpperCase()))) return `${first} ${second}`
  }
  return first
}

/** Prefere a grafia com minúsculas ("Corolla" a "COROLLA"). */
function betterLabel(a: string, b: string): string {
  const hasLower = (s: string) => /[a-zà-ú]/.test(s)
  if (hasLower(a) !== hasLower(b)) return hasLower(a) ? a : b
  return a
}

export function groupModels(models: FipeOption[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>()
  for (const m of models) {
    const base = modelBase(m.name)
    if (!base) continue
    const key = base.toUpperCase()
    const g = map.get(key)
    if (g) { g.versions.push(m); g.label = betterLabel(g.label, base) }
    else map.set(key, { key, label: base, versions: [m] })
  }
  const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })
  const out = [...map.values()]
  for (const g of out) g.versions.sort((a, b) => byName(a.name, b.name))
  return out.sort((a, b) => byName(a.label, b.label))
}

/** FIPE usa 32000 para "zero km". */
export const FIPE_ZERO_KM = 32000

/** "2021 Gasolina" → { year: 2021, label: '2021 Gasolina' }; "32000 Gasolina" → ano atual, "0 km". */
export function parseFipeYear(name: string, now = new Date()): { year: number | null; label: string } {
  const m = String(name ?? '').match(/^(\d{4,5})\s*(.*)$/)
  if (!m) return { year: null, label: name }
  const n = Number(m[1])
  const fuel = m[2]?.trim()
  if (n === FIPE_ZERO_KM) return { year: now.getFullYear(), label: `0 km${fuel ? ` ${fuel}` : ''}` }
  return { year: n, label: name }
}

/** Máscara de quilometragem: "190000" → "190.000"; "900" → "900". Máx. 7 dígitos. */
export function formatKm(v: string): string {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7)
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
