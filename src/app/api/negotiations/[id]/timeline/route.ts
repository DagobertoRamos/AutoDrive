// =============================================================================
// GET /api/negotiations/[id]/timeline — Histórico da negociação em português.
// Cada evento vira uma frase clara (quem, o quê, de/para), com valores
// formatados e nomes no lugar de ids. Edições de valores, pagamentos e débitos
// só aparecem para a gerência (gerente, gerente geral, ADM, MASTER).
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasMinRole, requireModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { describeAudit, describeStatus, type HistoryItem, extraHistory } from '@/lib/negotiation/history-text'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
const VEHICLE_ROLE: Record<string, string> = { VENDIDO: 'vendido', TROCA: 'de troca', COMPRADO: 'comprado', CONSIGNADO: 'consignado' }

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
    { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: params.id }),
    select: { id: true, tenantId: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  const isManager = hasMinRole(session.user.role, 'GERENTE')

  const dealId = params.id
  const [statusHistory, auditLogs, services, vehicles, pendencies, payments, debts, attachments, documents, discounts, changes, reopens, releases, imported] = await Promise.all([
    prisma.dealStatusHistory.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } }),
    prisma.dealAuditLog.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } }),
    prisma.dealService.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } }),
    prisma.dealVehicle.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } }),
    prisma.pendency.findMany({ where: { dealId } as never, orderBy: { createdAt: 'asc' } }),
    // Tudo o que acontece na negociação sem linha própria no log:
    prisma.dealPayment.findMany({ where: { dealId }, select: { type: true, method: true, value: true, status: true, bank: true, createdAt: true, paidAt: true } }),
    prisma.dealDebt.findMany({ where: { dealId }, select: { type: true, description: true, value: true, responsavel: true, createdAt: true } }),
    prisma.dealAttachment.findMany({ where: { dealId }, select: { category: true, fileName: true, uploadedByName: true, uploadedAt: true } }),
    prisma.dealDocument.findMany({ where: { dealId }, select: { type: true, name: true, createdAt: true, signedAt: true, signedBy: true } }),
    prisma.dealDiscountRequest.findMany({ where: { dealId }, select: { requestedValue: true, approvedValue: true, reason: true, status: true, createdAt: true, decidedAt: true, decisionNote: true, requestedById: true, decidedById: true } }),
    prisma.dealChange.findMany({ where: { dealId }, select: { value: true, beneficiary: true, createdAt: true } }),
    prisma.dealReopenLog.findMany({ where: { dealId }, select: { reason: true, createdAt: true, reopenedById: true } }),
    prisma.dealReleaseRequest.findMany({ where: { dealId }, select: { status: true, reason: true, requestedAt: true, reviewedAt: true, requestedBy: true, reviewedBy: true } }),
    prisma.dealHistoryEntry.findMany({ where: { dealId }, select: { summary: true, userName: true, createdAt: true } }),
  ])

  // Nomes: quem mudou o status + ids citados no log (vendedor, gerente, unidade, cliente).
  const refIds = new Set<string>()
  for (const a of auditLogs) if (a.field && /Id$/.test(a.field)) { if (a.oldValue) refIds.add(a.oldValue); if (a.newValue) refIds.add(a.newValue) }
  const userIds = [...new Set([
    ...statusHistory.map((h) => h.changedByUserId),
    ...discounts.flatMap((d) => [d.requestedById, d.decidedById]),
    ...reopens.map((r) => r.reopenedById),
    ...releases.flatMap((r) => [r.requestedBy, r.reviewedBy]),
  ].filter((x): x is string => !!x))]
  const ids = [...refIds]
  const [users, sellers, units, people] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...userIds, ...ids] } }, select: { id: true, name: true } }),
    ids.length ? prisma.seller.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, user: { select: { name: true } } } }) : [],
    ids.length ? prisma.unit.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [],
    ids.length ? prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, nomeCompleto: true } }) : [],
  ])
  const refs: Record<string, string> = {}
  for (const u of users) if (u.name) refs[u.id] = u.name
  for (const s of sellers) refs[s.id] = s.user?.name ?? s.fullName
  for (const u of units) refs[u.id] = u.name
  for (const p of people) if (p.nomeCompleto) refs[p.id] = p.nomeCompleto

  // Mudanças de status já registradas no histórico de status não se repetem.
  const statusKeys = new Set(statusHistory.map((h) => `${h.newStatus}:${Math.floor(new Date(h.createdAt).getTime() / 5000)}`))
  const items: HistoryItem[] = []

  for (const h of statusHistory) items.push(describeStatus(h, h.changedByUserId ? refs[h.changedByUserId] ?? null : null))
  for (const a of auditLogs) {
    if (a.action === 'CRIAR') continue
    if ((a.action === 'STATUS' || a.field === 'status') && statusKeys.has(`${a.newValue}:${Math.floor(new Date(a.createdAt).getTime() / 5000)}`)) continue
    // Ajustes automáticos (ex.: valor do veículo acompanhando o valor de venda) não poluem o histórico.
    if (a.field === 'vehicleValue' || a.field === 'totalPayments' || a.field === 'balance' || a.field === 'marginAmount') continue
    items.push(describeAudit({ ...a, createdAt: a.createdAt }, refs))
  }
  for (const s of services) {
    items.push({ kind: 'SERVICO', title: 'Serviço incluído', text: `Serviço ${s.name} incluído (${brl(Number(s.value))}).`, user: null, date: new Date(s.createdAt).toISOString() })
  }
  for (const v of vehicles) {
    const label = [v.brand, v.model].filter(Boolean).join(' ') || 'Veículo'
    items.push({ kind: 'VEICULO', title: 'Veículo vinculado', text: `${label}${v.plate ? ` (${v.plate})` : ''} vinculado como veículo ${VEHICLE_ROLE[v.role] ?? v.role.toLowerCase()}.`, user: null, date: new Date(v.createdAt).toISOString() })
  }
  for (const p of pendencies) {
    items.push({ kind: 'PENDENCIA', title: 'Pendência aberta', text: p.description ? `Pendência aberta: ${p.description}` : 'Pendência aberta para esta negociação.', user: null, date: new Date(p.createdAt).toISOString() })
  }

  const name = (id: string | null | undefined) => (id ? refs[id] ?? null : null)
  items.push(...extraHistory({
    audit: auditLogs, payments, debts, attachments, documents,
    discounts: discounts.map((d) => ({ ...d, requestedBy: name(d.requestedById), decidedBy: name(d.decidedById) })),
    changes,
    reopens: reopens.map((r) => ({ ...r, by: name(r.reopenedById) })),
    releases: releases.map((r) => ({ ...r, by: name(r.requestedBy), reviewer: name(r.reviewedBy) })),
    imported,
  }))

  const visible = items.filter((i) => isManager || !i.restricted)
  visible.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  // `description` mantém compatibilidade com telas antigas (= frase completa).
  return NextResponse.json({ data: visible.map((i) => ({ ...i, type: i.kind, icon: i.kind, description: i.text })) })
}
