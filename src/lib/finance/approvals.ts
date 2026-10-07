// =============================================================================
// Alçadas de aprovação (banco). Regras em approvals-core.
//   Config: SystemSetting `finance:approval:<tenantId>` (JSON).
//   approvalGate: chamada na baixa de DESPESA. Sem aprovação válida (APROVADO
//   com valor ≥ ao atual), abre/atualiza o pedido PENDENTE, avisa quem aprova e
//   bloqueia a baixa. Fluxo: solicitado → aprovado/recusado → pago.
//   Sem a tabela (migration pendente) a alçada não bloqueia (log de aviso).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { notifyMany } from '@/services/notification.service'
import { DEFAULT_APPROVAL_CONFIG, ROLE_LABEL, canDecide, normalizeConfig, rolesFor, type ApprovalConfig } from './approvals-core'

const KEY = (tenantId: string) => `finance:approval:${tenantId}`
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
type Actor = { id: string; name?: string | null; role?: string | null }

export async function getApprovalConfig(tenantId: string): Promise<ApprovalConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row) return DEFAULT_APPROVAL_CONFIG
  try { return normalizeConfig(JSON.parse(row.value)) } catch { return DEFAULT_APPROVAL_CONFIG }
}

export async function saveApprovalConfig(tenantId: string, raw: unknown, actor: Actor) {
  const before = await getApprovalConfig(tenantId)
  const cfg = normalizeConfig(raw)
  await prisma.systemSetting.upsert({
    where: { key: KEY(tenantId) },
    create: { tenantId, key: KEY(tenantId), value: JSON.stringify(cfg), group: 'finance', description: 'Alçadas de aprovação de pagamentos', updatedByUserId: actor.id },
    update: { value: JSON.stringify(cfg), updatedByUserId: actor.id },
  })
  await createSafeAuditLog({ userId: actor.id, tenantId, action: 'FINANCE_APPROVAL_CONFIG', entity: 'FinanceApprovalConfig', entityId: tenantId, userName: actor.name ?? null, userRole: actor.role ?? null, beforeData: before, afterData: cfg })
  return cfg
}

/** Bloqueia a baixa de despesa sem aprovação; abre o pedido. null = pode pagar. */
export async function approvalGate(e: { id: string; tenantId: string | null; type: string; amount: unknown; description: string; transferGroupId?: string | null }, actor: Actor): Promise<string | null> {
  if (!e.tenantId || e.type !== 'DESPESA' || e.transferGroupId) return null
  const amount = Math.abs(Number(e.amount))
  const roles = rolesFor(await getApprovalConfig(e.tenantId), amount)
  if (!roles) return null
  try {
    const cur = await prisma.financialApproval.findUnique({ where: { entryId: e.id } })
    if (cur?.status === 'APROVADO' && Number(cur.amount) + 0.009 >= amount) return null
    if (cur?.status === 'RECUSADO' && Number(cur.amount) === amount) return `Pagamento recusado${cur.decidedByName ? ` por ${cur.decidedByName}` : ''}${cur.reason ? `: ${cur.reason}` : ''}.`
    const fresh = !cur || cur.status !== 'PENDENTE' || Number(cur.amount) !== amount
    await prisma.financialApproval.upsert({
      where: { entryId: e.id },
      create: { tenantId: e.tenantId, entryId: e.id, amount, roles, status: 'PENDENTE', requestedById: actor.id },
      update: { amount, roles, status: 'PENDENTE', requestedById: actor.id, decidedById: null, decidedByName: null, decidedAt: null, reason: null },
    })
    if (fresh) {
      await createSafeAuditLog({ userId: actor.id, tenantId: e.tenantId, action: 'FINANCE_APPROVAL_REQUEST', entity: 'FinancialEntry', entityId: e.id, userName: actor.name ?? null, userRole: actor.role ?? null, afterData: { amount, roles } })
      const approvers = await prisma.user.findMany({ where: { tenantId: e.tenantId, status: 'ATIVO', role: { in: roles as never[] }, id: { not: actor.id } }, select: { id: true } })
      if (approvers.length) {
        await notifyMany({ userIds: approvers.map((u) => u.id), tenantId: e.tenantId, type: 'SISTEMA', title: 'Pagamento aguardando aprovação', message: `${e.description} — ${brl(amount)}.`, actionUrl: '/financeiro/aprovacoes', metadata: { kind: 'finance_approval', entryId: e.id }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] }).catch(() => {})
      }
    }
    return `Pagamento acima da alçada (${brl(amount)}): enviado para aprovação de ${roles.filter((r) => r !== 'MASTER').map((r) => ROLE_LABEL[r] ?? r).join(', ')}.`
  } catch (err) {
    console.warn('[finance-approval] tabela indisponível — alçada não aplicada', err instanceof Error ? err.message : err)
    return null
  }
}

export async function decideApproval(tenantId: string, approvalId: string, approve: boolean, reason: string | null, actor: Actor & { role: string }): Promise<string | null> {
  const a = await prisma.financialApproval.findFirst({ where: { id: approvalId, tenantId } })
  if (!a) return 'Pedido não encontrado.'
  if (a.status !== 'PENDENTE') return 'Este pedido já foi decidido.'
  const denied = canDecide(a.roles, actor, a.requestedById)
  if (denied) return denied
  if (!approve && !reason?.trim()) return 'Informe o motivo da recusa.'
  const r = await prisma.financialApproval.updateMany({
    where: { id: a.id, status: 'PENDENTE' },
    data: { status: approve ? 'APROVADO' : 'RECUSADO', decidedById: actor.id, decidedByName: actor.name ?? null, decidedAt: new Date(), reason: reason?.trim() || null },
  })
  if (r.count !== 1) return 'Este pedido foi decidido por outra pessoa.'
  await createSafeAuditLog({ userId: actor.id, tenantId, action: approve ? 'FINANCE_APPROVAL_APPROVE' : 'FINANCE_APPROVAL_REJECT', entity: 'FinancialEntry', entityId: a.entryId, userName: actor.name ?? null, userRole: actor.role, afterData: { amount: Number(a.amount), reason: reason?.trim() || null } })
  if (a.requestedById && a.requestedById !== actor.id) {
    const e = await prisma.financialEntry.findUnique({ where: { id: a.entryId }, select: { description: true } })
    await notifyMany({ userIds: [a.requestedById], tenantId, type: 'SISTEMA', title: approve ? 'Pagamento aprovado' : 'Pagamento recusado', message: `${e?.description ?? 'Lançamento'} — ${brl(Number(a.amount))}${approve ? '' : `: ${reason}`}.`, actionUrl: '/financeiro/pagar', metadata: { kind: 'finance_approval', entryId: a.entryId }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] }).catch(() => {})
  }
  return null
}

export async function listApprovals(tenantId: string) {
  const rows = await prisma.financialApproval.findMany({ where: { tenantId }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 })
  const entries = rows.length ? await prisma.financialEntry.findMany({ where: { id: { in: rows.map((r) => r.entryId) } }, select: { id: true, description: true, dueDate: true, counterparty: true, status: true } }) : []
  const users = [...new Set(rows.map((r) => r.requestedById).filter((x): x is string => !!x))]
  const names = users.length ? new Map((await prisma.user.findMany({ where: { id: { in: users } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])) : new Map<string, string>()
  const byId = new Map(entries.map((e) => [e.id, e]))
  return rows.map((r) => ({
    id: r.id, entryId: r.entryId, amount: Number(r.amount), roles: r.roles, status: r.status, reason: r.reason,
    requestedById: r.requestedById, requestedBy: r.requestedById ? names.get(r.requestedById) ?? null : null, createdAt: r.createdAt,
    decidedBy: r.decidedByName, decidedAt: r.decidedAt,
    entry: byId.get(r.entryId) ?? null,
  }))
}
