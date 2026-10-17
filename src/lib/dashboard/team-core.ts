// =============================================================================
// dashboard/team-core.ts — sinais de coaching (puro, testável).
// Linguagem neutra: descreve o fato, sem rótulo pejorativo.
// =============================================================================

export interface TeamMemberStats {
  openLeads: number
  leadsWithoutContact: number
  avgResponseMin: number | null
  responseSample: number
  visits30d: number
  salesMonth: number
}

export const COACHING_THRESHOLDS = {
  leadsWithoutContact: 3,
  slowResponseMin: 30,
  minResponseSample: 3,
  leadsForVisitCheck: 5,
  visitsForSaleCheck: 5,
}

export function coachingSignals(s: TeamMemberStats, t = COACHING_THRESHOLDS): string[] {
  const out: string[] = []
  if (s.leadsWithoutContact >= t.leadsWithoutContact) {
    out.push(`${s.leadsWithoutContact} leads ainda sem contato`)
  }
  if (s.avgResponseMin != null && s.responseSample >= t.minResponseSample && s.avgResponseMin > t.slowResponseMin) {
    const v = s.avgResponseMin >= 120 ? `${(s.avgResponseMin / 60).toFixed(1).replace('.', ',')} h` : `${Math.round(s.avgResponseMin)} min`
    out.push(`primeiro contato leva ${v} em média`)
  }
  if (s.openLeads >= t.leadsForVisitCheck && s.visits30d === 0) {
    out.push(`${s.openLeads} leads ativos e nenhuma visita em 30 dias`)
  }
  if (s.visits30d >= t.visitsForSaleCheck && s.salesMonth === 0) {
    out.push(`${s.visits30d} visitas em 30 dias e nenhuma venda no mês`)
  }
  return out
}
