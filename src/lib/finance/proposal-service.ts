// =============================================================================
// finance/proposal-service.ts — helpers puros das fichas profissionais (Fase 7).
// Validação de documentos obrigatórios por perfil do proponente. Sem banco.
// =============================================================================

import type { ProponentOccupation } from '@prisma/client'

export type RequiredDocsConfig = Partial<Record<'TODOS' | ProponentOccupation, string[]>>

const ci = (s: string) => s.trim().toLowerCase()

/** Lista de documentos exigidos para o perfil: comuns (TODOS) + ocupação. */
export function requiredDocsForProfile(config: RequiredDocsConfig | null | undefined, occupation: ProponentOccupation | null | undefined): string[] {
  const common = config?.TODOS ?? []
  const profile = occupation ? (config?.[occupation] ?? []) : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const name of [...common, ...profile]) {
    const v = (name ?? '').trim()
    if (!v || seen.has(ci(v))) continue
    seen.add(ci(v)); out.push(v)
  }
  return out
}

export interface DocRowLike { type: string; status: string }

/**
 * Documentos obrigatórios ainda NÃO satisfeitos. Um exigido é satisfeito quando
 * existe um documento com o mesmo nome e status APROVADO.
 */
export function pendingRequiredDocs(requiredNames: string[], rows: DocRowLike[]): string[] {
  const approved = new Set(rows.filter((r) => r.status === 'APROVADO').map((r) => ci(r.type)))
  return requiredNames.filter((name) => !approved.has(ci(name)))
}
