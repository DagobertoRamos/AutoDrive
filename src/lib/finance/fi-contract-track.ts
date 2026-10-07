// =============================================================================
// Acompanhamento do contrato de financiamento (F&I) até o crédito do banco.
//   Etapas: simulação → enviado → em análise → aprovado → formalização →
//   assinado → enviado ao banco → aguardando pagamento → pago (ou cancelado).
//   Confirmar o recebimento do financiamento em Recebimentos marca PAGO.
//   Sem a tabela (migration pendente): leitura devolve vazio, gravação avisa.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'

export const FI_STAGES = [
  { key: 'SIMULACAO', label: 'Simulação' }, { key: 'ENVIADO', label: 'Enviado' }, { key: 'EM_ANALISE', label: 'Em análise' },
  { key: 'APROVADO', label: 'Aprovado' }, { key: 'FORMALIZACAO', label: 'Formalização' }, { key: 'ASSINADO', label: 'Assinado' },
  { key: 'ENVIADO_BANCO', label: 'Enviado ao banco' }, { key: 'AGUARDANDO_PAGAMENTO', label: 'Aguardando pagamento' },
  { key: 'PAGO', label: 'Pago' }, { key: 'CANCELADO', label: 'Cancelado' },
] as const
export type FiStage = (typeof FI_STAGES)[number]['key']
export const FI_STAGE_LABEL = Object.fromEntries(FI_STAGES.map((s) => [s.key, s.label])) as Record<string, string>
const STAGE_KEYS = new Set<string>(FI_STAGES.map((s) => s.key))

export interface FiTrack {
  stage: string; proposalNumber: string | null; approvedAt: string | null; signedAt: string | null
  sentToBankAt: string | null; expectedCreditAt: string | null; creditedAt: string | null; notes: string | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)
const day = (v: unknown): Date | null | undefined => {
  if (v === undefined) return undefined
  if (!v) return null
  const s = String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00.000Z`) : undefined
}

export async function loadTracks(paymentIds: string[]): Promise<Map<string, FiTrack>> {
  if (!paymentIds.length) return new Map()
  const rows = await prisma.financeContractTrack.findMany({ where: { paymentId: { in: paymentIds } } }).catch(() => [])
  return new Map(rows.map((r) => [r.paymentId, {
    stage: r.stage, proposalNumber: r.proposalNumber, approvedAt: iso(r.approvedAt), signedAt: iso(r.signedAt),
    sentToBankAt: iso(r.sentToBankAt), expectedCreditAt: iso(r.expectedCreditAt), creditedAt: iso(r.creditedAt), notes: r.notes,
  }]))
}

export async function saveTrack(tenantId: string, paymentId: string, raw: Record<string, unknown>, actor: { id: string; name?: string | null; role?: string | null }): Promise<string | null> {
  const stage = typeof raw.stage === 'string' && STAGE_KEYS.has(raw.stage) ? raw.stage : undefined
  const data = {
    ...(stage ? { stage } : {}),
    ...(raw.proposalNumber !== undefined ? { proposalNumber: String(raw.proposalNumber ?? '').trim().slice(0, 60) || null } : {}),
    approvedAt: day(raw.approvedAt), signedAt: day(raw.signedAt), sentToBankAt: day(raw.sentToBankAt),
    expectedCreditAt: day(raw.expectedCreditAt), creditedAt: day(raw.creditedAt),
    ...(raw.notes !== undefined ? { notes: String(raw.notes ?? '').trim().slice(0, 500) || null } : {}),
  }
  for (const k of Object.keys(data) as (keyof typeof data)[]) if (data[k] === undefined) delete data[k]
  try {
    const before = await prisma.financeContractTrack.findUnique({ where: { paymentId } })
    await prisma.financeContractTrack.upsert({
      where: { paymentId },
      create: { tenantId, paymentId, stage: stage ?? 'ENVIADO', ...data, updatedById: actor.id },
      update: { ...data, updatedById: actor.id },
    })
    await createSafeAuditLog({ userId: actor.id, tenantId, action: 'FI_CONTRACT_TRACK', entity: 'DealPayment', entityId: paymentId, userName: actor.name ?? null, userRole: actor.role ?? null, beforeData: before ? { stage: before.stage } : null, afterData: data })
    return null
  } catch {
    return 'Acompanhamento do contrato ainda não ativado: aplique a migration do banco.'
  }
}

/** Recebimento do financiamento confirmado → contrato PAGO (best-effort). */
export async function markTrackPaid(tenantId: string | null, paymentId: string, paidAt: Date) {
  if (!tenantId) return
  await prisma.financeContractTrack.upsert({
    where: { paymentId },
    create: { tenantId, paymentId, stage: 'PAGO', creditedAt: paidAt },
    update: { stage: 'PAGO', creditedAt: paidAt },
  }).catch(() => {})
}
