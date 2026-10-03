// =============================================================================
// Estúdio social — variedade nos posts em lote (PURO, testado).
// Cada carro sai com o seu próprio "jeito": modelo visual sorteado entre os
// escolhidos pela loja (até 2), chamada da arte e clima da música sorteados
// (quando "Variar" está ligado). O sorteio é estável pela semente (carro +
// rodada), então a prévia e o envio mostram o mesmo resultado.
// =============================================================================

import { ART_TEMPLATES, type ArtTemplate } from './formats'
import type { DesignStyle } from './design-styles'
import { MUSIC_MOODS, type MusicChoice } from './music-core'

/** Até quantos modelos visuais a loja escolhe para sortear entre eles. */
export const MAX_DESIGNS = 2

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h >>> 0
}
const pick = <T,>(list: readonly T[], seed: string): T => list[hash(seed) % list.length]

/** Lista de modelos válida: 1 a MAX_DESIGNS, sem repetir (o último escolhido entra, o mais antigo sai). */
export function limitDesigns(list: DesignStyle[]): DesignStyle[] {
  const uniq = [...new Set(list)]
  return uniq.slice(Math.max(0, uniq.length - MAX_DESIGNS))
}

export interface VarietyInput { designs: DesignStyle[]; template: ArtTemplate; vary: boolean; music: MusicChoice | null }
export interface Variant { design: DesignStyle; template: ArtTemplate; music: MusicChoice | null }

/** Jeito deste carro: modelo entre os escolhidos; com "Variar", chamada e clima da música sorteados. */
export function variantFor(seed: string, i: VarietyInput): Variant {
  const designs = i.designs.length ? i.designs : (['CLASSICO'] as DesignStyle[])
  const music = i.vary && i.music?.mode === 'AUTO' ? { mode: 'AUTO' as const, mood: pick(MUSIC_MOODS, `${seed}:m`) } : i.music
  return {
    design: pick(designs, `${seed}:d`),
    template: i.vary ? pick(ART_TEMPLATES, `${seed}:t`) : i.template,
    music,
  }
}
