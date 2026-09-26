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
