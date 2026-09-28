// =============================================================================
// Opcionais do anúncio — consulta ao catálogo (options-catalog.data.ts).
// Guardados como lista simples de nomes em SiteListing.options (site, catálogo
// da Meta e portais leem dali); grupo e tipo são deduzidos do catálogo.
// =============================================================================

import { OPTION_CATALOG, type OptionKind } from './options-catalog.data'

export { OPTION_CATALOG, type OptionKind } from './options-catalog.data'

export const OPTION_KIND_LABEL: Record<OptionKind, string> = {
  EQUIPAMENTO: 'Equipamento',
  ACESSORIO:   'Acessório',
  HISTORICO:   'Estado/histórico',
}

export const foldText = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

export interface OptionInfo { name: string; group: string; section: string; kind: OptionKind }

const INDEX = new Map<string, OptionInfo>()
for (const g of OPTION_CATALOG) for (const s of g.sections) for (const name of s.items) {
  const k = foldText(name)
  if (!INDEX.has(k)) INDEX.set(k, { name, group: g.group, section: s.section, kind: s.kind })
}

export const CATALOG_SIZE = INDEX.size

/** Dados do item no catálogo (sem acento/maiúsculas); null = item livre digitado pela loja. */
export function optionInfo(name: string): OptionInfo | null {
  return INDEX.get(foldText(name)) ?? null
}

/** Limpa a lista: sem vazios/repetidos; nome do catálogo quando bater (grafia padrão). */
export function cleanOptions(input: unknown, max = 200): string[] {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\n,;]+/) : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!s) continue
    const name = optionInfo(s)?.name ?? s
    const k = foldText(name)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(name)
    if (out.length >= max) break
  }
  return out
}

/** Busca no catálogo (todas as palavras, sem acento). */
export function searchOptions(q: string, limit = 60): OptionInfo[] {
  const words = foldText(q).split(' ').filter(Boolean)
  if (!words.length) return []
  const out: OptionInfo[] = []
  for (const info of INDEX.values()) {
    const hay = foldText(`${info.name} ${info.section} ${info.group}`)
    if (words.every((w) => hay.includes(w))) out.push(info)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Agrupa os opcionais marcados para exibição (site/anúncio): equipamentos por
 * grupo na ordem do catálogo, depois acessórios, estado/histórico e "Outros".
 */
export function groupOptions(options: string[]): Array<{ group: string; items: string[] }> {
  const order = OPTION_CATALOG.map((g) => g.group)
  const buckets = new Map<string, string[]>()
  for (const o of cleanOptions(options)) {
    const g = optionInfo(o)?.group ?? 'Outros'
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(o)
  }
  return [...order, 'Outros'].filter((g) => buckets.has(g)).map((g) => ({ group: g, items: buckets.get(g)! }))
}

// ── Opcionais a partir do cadastro (PURO, testado) ───────────────────────────

const plain = (s: string) => ` ${foldText(s).replace(/[^a-z0-9]+/g, ' ').trim()} `
/** Como as lojas escrevem → nome do catálogo (ou item de estado conhecido). */
const SYNONYMS: Array<[string[], string]> = [
  [['ar condicionado', 'ar cond', 'ar condic', 'arcondicionado'], 'Ar-condicionado'],
  [['dir hidraulica', 'direcao hidraulica'], 'Direção hidráulica'],
  [['dir eletrica', 'direcao eletrica'], 'Direção elétrica'],
  [['vidros eletricos', 'vidro eletrico', 'vidros eletr'], 'Vidros elétricos dianteiros'],
  [['travas eletricas', 'trava eletrica', 'travas eletr'], 'Travas elétricas'],
  [['sensor de re', 'sensor de estacionamento', 'sensor estacionamento'], 'Sensor de estacionamento traseiro'],
  [['camera de re', 'camera re'], 'Câmera de ré'],
  [['rodas de liga', 'roda de liga', 'rodas liga'], 'Rodas de liga leve'],
  [['bancos de couro', 'banco de couro', 'bancos couro'], 'Bancos em couro'],
  [['central multimidia', 'multimidia'], 'Central multimídia'],
  [['piloto automatico'], 'Piloto automático'],
  [['farol de neblina', 'farois de neblina', 'milha'], 'Faróis de neblina'],
  [['periciado', 'laudo cautelar aprovado', 'cautelar aprovad'], 'Laudo cautelar aprovado'],
  [['ipva pago', 'ipva quitado', 'ipva 20'], 'IPVA pago'],
  [['unico dono'], 'Único dono'],
  [['revisoes em dia', 'revisado', 'revisoes feitas'], 'Revisões em dia'],
]
// Dados que já estão na ficha (câmbio, combustível): não viram opcional.
const FACT = /^(cambio|transmissao|flex|gasolina|etanol|alcool|diesel|gnv|eletrico|hibrido|manual|automatico)/
// Itens que também são nome de seção/grupo (genéricos demais para marcar sozinhos).
const GENERIC = new Set([...OPTION_CATALOG.flatMap((g) => [g.group, ...g.sections.map((s) => s.section)])].map(foldText))

/**
 * Opcionais citados no cadastro do carro (versão, descrição, observações,
 * avaliação): nomes do catálogo encontrados no texto + jeitos comuns de
 * escrever. Só marca o que está escrito — não inventa equipamento.
 */
export function inferOptions(texts: Array<string | null | undefined>): string[] {
  const hay = plain(texts.filter(Boolean).join(' • '))
  if (hay.trim().length < 2) return []
  const found: string[] = []
  for (const info of INDEX.values()) {
    if (GENERIC.has(foldText(info.name)) || FACT.test(foldText(info.name))) continue
    const variants = [info.name, ...info.name.split(/\s+[–-]\s+/).slice(1).flatMap((x) => x.split('/'))]
    if (variants.some((v) => { const p = plain(v); return p.trim().length >= 3 && hay.includes(p) })) found.push(info.name)
  }
  for (const [words, target] of SYNONYMS) if (words.some((w) => hay.includes(plain(w)))) found.push(optionInfo(target)?.name ?? target)
  // Remove o genérico quando o específico também bateu ("Direção" × "Direção hidráulica").
  const uniq = cleanOptions(found).filter((n) => !FACT.test(foldText(n)) && !GENERIC.has(foldText(n)))
  return uniq.filter((n) => !uniq.some((m) => m !== n && plain(m).includes(plain(n))))
}
