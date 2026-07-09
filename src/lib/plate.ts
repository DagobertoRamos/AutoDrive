// =============================================================================
// Placas — normalização e casamento (busca de pendências, negociações, estoque)
//
// Placas no banco são String livre: podem vir com hífen (ABC-1234), espaços,
// minúsculas ou em formato antigo (LLLNNNN) x Mercosul (LLLNLNN). A busca exata
// falhava por qualquer uma dessas diferenças. Estas funções são PURAS (sem I/O)
// para ficarem 100% cobertas por teste.
// =============================================================================

// Mercosul (LLLNLNN) e antigo (LLLNNNN) diferem SÓ no 5º caractere (índice 4):
// antigo = dígito 0-9; Mercosul = letra A-J, onde A=0, B=1, … J=9. Canonizamos
// sempre para a forma com dígito, de modo que a MESMA placa case nos dois
// formatos (ex.: antigo ABC1C34 ⇄ Mercosul; a conversão é determinística).
const MERCOSUL_5TH: Record<string, string> = { A: '0', B: '1', C: '2', D: '3', E: '4', F: '5', G: '6', H: '7', I: '8', J: '9' }

/** Uppercase + remove tudo que não for letra/dígito (hífen, espaço, etc.). */
export function normalizePlate(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/**
 * Forma canônica para comparação: normaliza e, quando tem 7 chars, converte o
 * 5º de letra Mercosul (A-J) para dígito — assim antigo e Mercosul da MESMA
 * placa colidem. Entradas parciais (< 7) só são normalizadas.
 */
export function canonicalPlate(raw: string | null | undefined): string {
  const n = normalizePlate(raw)
  if (n.length !== 7) return n
  const c = n[4]
  const digit = MERCOSUL_5TH[c]
  return digit ? n.slice(0, 4) + digit + n.slice(5) : n
}

/**
 * A placa `stored` casa com a busca `query`? Aceita:
 *  - completa (ABC1D23 == abc1d23 == ABC-1D23)
 *  - parcial / prefixo (ABC, ABC1, ABC1D…)
 *  - equivalência antigo ⇄ Mercosul (mesma placa nos dois formatos)
 */
export function plateMatches(query: string | null | undefined, stored: string | null | undefined): boolean {
  const q = normalizePlate(query)
  const s = normalizePlate(stored)
  if (q.length < 2 || !s) return false
  // Prefixo direto (cobre parcial em qualquer formato).
  if (s.startsWith(q)) return true
  // Equivalência de formato (canônico), completa ou por prefixo.
  const cq = canonicalPlate(query)
  const cs = canonicalPlate(stored)
  return cs === cq || cs.startsWith(cq)
}

/** Prefixo de letras p/ pré-filtro barato no banco (as 3 letras iniciais). */
export function platePrefix(raw: string | null | undefined): string {
  return normalizePlate(raw).slice(0, 3)
}
