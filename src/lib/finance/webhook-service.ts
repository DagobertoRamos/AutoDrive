// =============================================================================
// finance/webhook-service.ts — helpers puros do receptor de webhook (Fase 7b).
// Sem banco. Verificação de segredo, extração genérica de campos e mapeamento
// de status do provedor → status interno da submissão. O ESQUEMA DE ASSINATURA
// REAL (HMAC do provedor) substitui `secretsMatch` quando houver provedor
// oficial homologado; por ora é um segredo compartilhado simples.
// =============================================================================

export const SUBMISSION_STATUS = ['ENVIADA', 'EM_ANALISE', 'PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA'] as const
export type SubmissionStatus = (typeof SUBMISSION_STATUS)[number]

/** Compara o segredo recebido com o esperado (comprimento + conteúdo). */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || !provided) return false
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/** Extrai campos comuns de um payload genérico de webhook. */
export function extractWebhookFields(payload: unknown): { externalId: string | null; statusRaw: string | null; message: string | null } {
  const p = (payload ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) { const v = p[k]; if (typeof v === 'string' && v.trim()) return v.trim() }
    return null
  }
  return {
    externalId: pick('externalId', 'external_id', 'proposalId', 'proposal_id', 'id', 'protocol', 'protocolo'),
    statusRaw: pick('status', 'situacao', 'situation', 'state'),
    message: pick('message', 'mensagem', 'reason', 'motivo', 'detail'),
  }
}

const STATUS_MAP: Record<string, SubmissionStatus> = {
  aprovada: 'APROVADA', aprovado: 'APROVADA', approved: 'APROVADA', approve: 'APROVADA',
  recusada: 'RECUSADA', recusado: 'RECUSADA', rejected: 'RECUSADA', denied: 'RECUSADA', reproved: 'RECUSADA',
  em_analise: 'EM_ANALISE', analyzing: 'EM_ANALISE', analysis: 'EM_ANALISE', in_review: 'EM_ANALISE',
  pendente: 'PENDENTE', pending: 'PENDENTE',
  cancelada: 'CANCELADA', cancelado: 'CANCELADA', canceled: 'CANCELADA', cancelled: 'CANCELADA',
  enviada: 'ENVIADA', enviado: 'ENVIADA', sent: 'ENVIADA', submitted: 'ENVIADA',
}

/** Mapeia o status bruto do provedor para o status interno. null se desconhecido. */
export function mapProviderStatus(raw: string | null | undefined): SubmissionStatus | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (STATUS_MAP[key]) return STATUS_MAP[key]
  const upper = raw.trim().toUpperCase() as SubmissionStatus
  return (SUBMISSION_STATUS as readonly string[]).includes(upper) ? upper : null
}
