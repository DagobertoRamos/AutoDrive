// =============================================================================
// CRM F2 — Deduplicação / resolução de identidade contra o banco (modo ALERTA).
// NÃO bloqueia, NÃO mescla, NÃO apaga: só ENCONTRA e classifica (HARD/SOFT) para
// (a) idempotência por source+externalLeadId, (b) reusar o contato existente,
// (c) gerar candidato à mesclagem p/ revisão. Tenant-scoped.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { LeadStatus } from '@prisma/client'
import { normCpf, isValidCpf, phoneKey, normEmail, externalKey } from '@/lib/crm/identity'

const OPEN_LEAD: LeadStatus[] = ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'RECYCLED']

export interface IdentityInput {
  cpf?: string | null
  phone?: string | null
  email?: string | null
  name?: string | null
  source?: string | null
  externalLeadId?: string | null
  excludeLeadId?: string | null
}

export interface DedupMatch { leadId?: string; customerId?: string; reason: string }
export interface DedupResult {
  extKey: string | null
  idempotentLeadId: string | null // lead c/ mesmo source+externalLeadId (não recriar)
  customerId: string | null // contato existente p/ reusar (não criar pessoa nova)
  hardMatch: DedupMatch | null
  softMatches: DedupMatch[]
}

export async function resolveIdentity(tenantId: string, input: IdentityInput): Promise<DedupResult> {
  const result: DedupResult = { extKey: externalKey(input.source, input.externalLeadId), idempotentLeadId: null, customerId: null, hardMatch: null, softMatches: [] }

  // 1) Idempotência: mesmo source + externalLeadId → já existe, não recriar.
  if (result.extKey && input.externalLeadId) {
    const dup = await prisma.marketingLead.findFirst({
      where: { tenantId, source: String(input.source), metadata: { path: ['externalLeadId'], equals: String(input.externalLeadId) } as never },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null)
    if (dup) { result.idempotentLeadId = dup.id; return result }
  }

  const cpf = normCpf(input.cpf)
  const pk = phoneKey(input.phone)
  const email = normEmail(input.email)

  // 2) Contato existente por CPF válido (contains nos dígitos — pega quando o
  // Customer.cpf está salvo só com números; formatado pode escapar, é best-effort).
  if (cpf && isValidCpf(cpf)) {
    const byCpf = await prisma.customer.findFirst({ where: { tenantId, cpf: { contains: cpf } }, select: { id: true }, orderBy: { createdAt: 'desc' } }).catch(() => null)
    if (byCpf) { result.customerId = byCpf.id; result.hardMatch = { customerId: byCpf.id, reason: `Mesmo CPF (${cpf.slice(0, 3)}…)` } }
  }

  // 3) Por telefone (últimos 8) — contato + lead ABERTO (não criar outro card).
  if (pk) {
    const [byPhone, openLead] = await Promise.all([
      prisma.customer.findFirst({ where: { tenantId, phone: { contains: pk } }, select: { id: true }, orderBy: { createdAt: 'desc' } }).catch(() => null),
      prisma.marketingLead.findFirst({ where: { tenantId, phone: { contains: pk }, status: { in: OPEN_LEAD }, ...(input.excludeLeadId ? { id: { not: input.excludeLeadId } } : {}) }, select: { id: true }, orderBy: { createdAt: 'desc' } }).catch(() => null),
    ])
    if (byPhone && !result.customerId) result.customerId = byPhone.id
    if (openLead) result.hardMatch = result.hardMatch ?? { leadId: openLead.id, reason: 'Já existe lead aberto com este telefone' }
    else if (byPhone && !result.hardMatch) result.hardMatch = { customerId: byPhone.id, reason: 'Mesmo telefone de um contato existente' }
  }

  // 4) Por e-mail — SOFT (identificador complementar).
  if (email) {
    const byEmail = await prisma.marketingLead.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' }, status: { in: OPEN_LEAD }, ...(input.excludeLeadId ? { id: { not: input.excludeLeadId } } : {}) }, select: { id: true }, orderBy: { createdAt: 'desc' } }).catch(() => null)
    if (byEmail && byEmail.id !== result.hardMatch?.leadId) result.softMatches.push({ leadId: byEmail.id, reason: 'Mesmo e-mail em outro lead aberto' })
    if (!result.customerId) {
      const custEmail = await prisma.customer.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } }, select: { id: true }, orderBy: { createdAt: 'desc' } }).catch(() => null)
      if (custEmail) result.customerId = custEmail.id
    }
  }

  return result
}
