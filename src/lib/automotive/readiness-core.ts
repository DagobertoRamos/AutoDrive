// =============================================================================
// Compliance Engine — "o veículo está pronto para vender?" (puro).
// Junta disponibilidade, restrições, RENAVE, nota de entrada, vistoria,
// documentos e consignação num único veredito. Restrição bloqueante SEMPRE
// impede; o resto segue a régua da loja (OFF / WARN / BLOCK).
// =============================================================================

import type { Enforcement, OpsConfig } from './capabilities'

export interface ReadinessFacts {
  stock: { canSelect: boolean; warning: string | null }
  restrictions: { kind: string; blocking: boolean; description?: string | null }[]
  /** Status de RENAVE do veículo no estoque: IN (entrada confirmada), OUT, NONE. */
  renaveStock: 'IN' | 'OUT' | 'NONE' | 'PENDING'
  renaveRequired: boolean
  fiscalEntry: 'AUTHORIZED' | 'PENDING' | 'NONE' | 'REJECTED'
  fiscalRequired: boolean
  cautelarStatus: string | null
  inspection: { status: string; validUntil: Date | string | null } | null
  hasCrlv: boolean
  consigned: boolean
  consignment: { status: string; endsAt: Date | string | null } | null
  /** Última consulta de débitos (null = não consultado). */
  debts?: { total: number; count: number } | null
  now?: Date
}

export interface ReadinessCheck {
  key: 'stock' | 'restrictions' | 'renave' | 'fiscal' | 'inspection' | 'documents' | 'consignment' | 'debts'
  label: string
  ok: boolean
  /** true = impede a venda. */
  blocking: boolean
  reason: string | null
  action: { key: string; label: string } | null
}

export interface Readiness {
  ready: boolean
  blockers: ReadinessCheck[]
  warnings: ReadinessCheck[]
  checks: ReadinessCheck[]
}

const KIND_TEXT: Record<string, string> = {
  JUDICIAL: 'Restrição judicial', ROUBO_FURTO: 'Registro de roubo/furto', ADMINISTRATIVA: 'Restrição administrativa',
  TRIBUTARIA: 'Restrição tributária', RENAJUD: 'Bloqueio RENAJUD', GRAVAME: 'Gravame ativo', OUTRA: 'Restrição',
}
export function restrictionKindText(kind: string): string { return KIND_TEXT[kind] ?? 'Restrição' }

function apply(enf: Enforcement, ok: boolean): { ok: boolean; blocking: boolean; skip: boolean } {
  if (enf === 'OFF') return { ok: true, blocking: false, skip: true }
  return { ok, blocking: !ok && enf === 'BLOCK', skip: false }
}

export function evaluateSaleReadiness(f: ReadinessFacts, cfg: Pick<OpsConfig, 'enforcement'>): Readiness {
  const now = f.now ?? new Date()
  const checks: ReadinessCheck[] = []

  checks.push({ key: 'stock', label: 'Estoque', ok: f.stock.canSelect, blocking: !f.stock.canSelect, reason: f.stock.canSelect ? null : (f.stock.warning ?? 'Veículo indisponível para venda.'), action: null })

  const blockingR = f.restrictions.filter((r) => r.blocking)
  const softR = f.restrictions.filter((r) => !r.blocking)
  if (blockingR.length) {
    checks.push({ key: 'restrictions', label: restrictionKindText(blockingR[0].kind), ok: false, blocking: true, reason: blockingR[0].description || 'Restrição impede a venda.', action: { key: 'restriction.view', label: 'Ver pendência' } })
  } else {
    checks.push({ key: 'restrictions', label: 'Restrições', ok: softR.length === 0, blocking: false, reason: softR.length ? `${restrictionKindText(softR[0].kind)}${softR[0].description ? `: ${softR[0].description}` : ''}` : null, action: softR.length ? { key: 'restriction.view', label: 'Ver' } : null })
  }

  if (f.renaveRequired) {
    const a = apply(cfg.enforcement.renaveEntry, f.renaveStock === 'IN')
    if (!a.skip) checks.push({ key: 'renave', label: 'RENAVE', ok: a.ok, blocking: a.blocking, reason: a.ok ? null : f.renaveStock === 'PENDING' ? 'Entrada no RENAVE aguardando confirmação.' : 'Entrada no RENAVE não registrada.', action: a.ok ? null : { key: 'renave.entry', label: 'Registrar entrada' } })
  }

  if (f.fiscalRequired) {
    const a = apply(cfg.enforcement.fiscalEntry, f.fiscalEntry === 'AUTHORIZED')
    if (!a.skip) checks.push({ key: 'fiscal', label: 'Fiscal', ok: a.ok, blocking: a.blocking, reason: a.ok ? null : f.fiscalEntry === 'REJECTED' ? 'NF-e de entrada rejeitada.' : 'NF-e de entrada não vinculada.', action: a.ok ? null : { key: 'fiscal.issue', label: 'Vincular NF-e' } })
  }

  // Vistoria/perícia: laudo reprovado sempre impede; o resto segue a régua.
  const cautelarBad = f.cautelarStatus === 'REPROVADA'
  if (cautelarBad) {
    checks.push({ key: 'inspection', label: 'Vistoria', ok: false, blocking: true, reason: 'Laudo cautelar reprovado.', action: { key: 'inspection.view', label: 'Ver laudo' } })
  } else {
    const valid = !!f.inspection && f.inspection.status === 'VALID' && (!f.inspection.validUntil || new Date(f.inspection.validUntil) >= now)
    const a = apply(cfg.enforcement.inspection, valid)
    if (!a.skip) checks.push({ key: 'inspection', label: 'Vistoria', ok: a.ok, blocking: a.blocking, reason: a.ok ? null : f.inspection?.status === 'VALID' ? 'Vistoria vencida.' : 'Sem vistoria válida.', action: a.ok ? null : { key: 'inspection.add', label: 'Registrar vistoria' } })
  }

  {
    const a = apply(cfg.enforcement.documents, f.hasCrlv)
    if (!a.skip) checks.push({ key: 'documents', label: 'Documentação', ok: a.ok, blocking: a.blocking, reason: a.ok ? null : 'CRLV não anexado.', action: a.ok ? null : { key: 'documents.view', label: 'Ver documentos' } })
  }

  if (f.consigned) {
    const active = f.consignment && f.consignment.status === 'ACTIVE'
    const expired = active && f.consignment!.endsAt && new Date(f.consignment!.endsAt) < now
    checks.push({ key: 'consignment', label: 'Consignação', ok: !!active && !expired, blocking: false, reason: !active ? 'Sem contrato de consignação ativo.' : expired ? 'Contrato de consignação vencido.' : null, action: !active || expired ? { key: 'consignment.view', label: 'Ver contrato' } : null })
  }

  if (f.debts && f.debts.count > 0) {
    const brl = f.debts.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    checks.push({ key: 'debts', label: 'Débitos', ok: false, blocking: false, reason: `${f.debts.count} débito(s) em aberto, total ${brl}.`, action: { key: 'debts.view', label: 'Ver débitos' } })
  }

  const blockers = checks.filter((c) => !c.ok && c.blocking)
  const warnings = checks.filter((c) => !c.ok && !c.blocking)
  return { ready: blockers.length === 0, blockers, warnings, checks }
}

/** Critérios para o "?" de "Veículo pronto para venda". */
export const READINESS_CRITERIA = 'Disponível no estoque, sem restrição que impeça a venda e, conforme a configuração da loja, com entrada no RENAVE, NF-e de entrada, vistoria e CRLV em dia.'
