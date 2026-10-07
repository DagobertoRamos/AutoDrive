// =============================================================================
// Conciliação bancária (banco) — regras em bank-statement-core.
//   importStatement → grava as linhas do OFX/CSV (idempotente por fingerprint).
//   listLines       → linhas da conta + sugestões (lançamentos com o mesmo valor:
//                     realizados na conta ou títulos em aberto, data ±15 dias).
//   matchLine       → concilia 1×1 ou 1×N: título em aberto é baixado na data da
//                     linha e na conta; a soma precisa bater com a linha. Um
//                     lançamento só concilia com uma linha.
//   createFromLine  → tarifa/rendimento sem lançamento: cria já realizado e concilia.
//   ignoreLine / unmatchLine. Nada é apagado; tudo vai para a auditoria.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { lineFingerprint, matchScore, parseStatement, sumsMatch, type MatchCandidate } from './bank-statement-core'
import { noonUtc } from './recurrence-core'
import { settleTitle, type Actor } from './settlement'
import { periodError } from './period-lock'

const spYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const signed = (e: { type: string; amount: unknown }) => (e.type === 'RECEITA' ? 1 : -1) * Number(e.amount)
const audit = (actor: Actor, tenantId: string, action: string, entityId: string, after: unknown) =>
  createSafeAuditLog({ userId: actor.id, tenantId, action, entity: 'BankStatementLine', entityId, userName: actor.name ?? null, userRole: actor.role ?? null, afterData: after })

export async function importStatement(tenantId: string, accountId: string, fileName: string, text: string, actor: Actor) {
  const acc = await prisma.financialAccount.findFirst({ where: { id: accountId, tenantId }, select: { id: true } })
  if (!acc) return { error: 'Conta inválida.' }
  const lines = parseStatement(fileName, text)
  if (!lines.length) return { error: 'Nenhum lançamento encontrado no arquivo (OFX ou CSV com data, histórico e valor).' }
  const importId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const seen = new Map<string, number>()
  const data = lines.map((l) => {
    const k = `${l.date}|${l.amount}|${l.description}`
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    return { tenantId, accountId, importId, date: noonUtc(l.date), amount: l.amount, description: l.description, document: l.document, fingerprint: lineFingerprint(accountId, l, n), createdById: actor.id }
  })
  const r = await prisma.bankStatementLine.createMany({ data, skipDuplicates: true })
  await createSafeAuditLog({ userId: actor.id, tenantId, action: 'BANK_STATEMENT_IMPORT', entity: 'FinancialAccount', entityId: accountId, userName: actor.name ?? null, userRole: actor.role ?? null, afterData: { fileName, lines: lines.length, created: r.count, importId } })
  return { read: lines.length, created: r.count, duplicates: lines.length - r.count }
}

async function reconciledEntryIds(tenantId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await prisma.bankStatementLine.findMany({ where: { tenantId, status: 'CONCILIADO', matchedEntryIds: { hasSome: ids } }, select: { matchedEntryIds: true } })
  return new Set(rows.flatMap((r) => r.matchedEntryIds))
}

export async function listLines(tenantId: string, accountId: string, status: string, from?: string | null, to?: string | null) {
  const lines = await prisma.bankStatementLine.findMany({
    where: {
      tenantId, accountId, ...(status && status !== 'TODOS' ? { status } : {}),
      ...(from || to ? { date: { ...(from ? { gte: noonUtc(from) } : {}), ...(to ? { lte: noonUtc(to) } : {}) } } : {}),
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
    take: 500,
  })
  const pend = lines.filter((l) => l.status === 'PENDENTE')
  const matchedIds = [...new Set(lines.flatMap((l) => l.matchedEntryIds))]
  const matched = matchedIds.length ? await prisma.financialEntry.findMany({ where: { id: { in: matchedIds } }, select: { id: true, description: true, type: true, amount: true, paidDate: true } }) : []
  const matchedById = new Map(matched.map((m) => [m.id, m]))

  let candidates: (MatchCandidate & { status: string; accountId: string | null })[] = []
  if (pend.length) {
    const dates = pend.map((l) => +l.date)
    const min = new Date(Math.min(...dates) - 15 * 86_400_000), max = new Date(Math.max(...dates) + 15 * 86_400_000)
    const amounts = [...new Set(pend.map((l) => Math.abs(Number(l.amount))))]
    const rows = await prisma.financialEntry.findMany({
      where: {
        tenantId, transferGroupId: null, amount: { in: amounts },
        OR: [
          { status: { in: ['PAGO', 'RECEBIDO'] }, accountId, paidDate: { gte: min, lte: max } },
          { status: 'PREVISTO', OR: [{ accountId }, { accountId: null }], dueDate: { gte: min, lte: max } },
        ],
      },
      select: { id: true, type: true, amount: true, status: true, paidDate: true, dueDate: true, description: true, counterparty: true, documentNumber: true, accountId: true },
      take: 2000,
    })
    const done = await reconciledEntryIds(tenantId, rows.map((r) => r.id))
    candidates = rows.filter((r) => !done.has(r.id)).map((r) => ({
      id: r.id, signedAmount: signed(r), date: spYmd(r.paidDate ?? r.dueDate ?? new Date()), description: r.description,
      counterparty: r.counterparty, documentNumber: r.documentNumber, status: r.status, accountId: r.accountId,
    }))
  }

  return lines.map((l) => {
    const line = { date: spYmd(l.date), amount: Number(l.amount), description: l.description, document: l.document }
    const suggestions = l.status === 'PENDENTE'
      ? candidates.map((c) => ({ ...c, score: matchScore(line, c) })).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)
      : []
    return {
      id: l.id, ...line, status: l.status, matchedAt: l.matchedAt,
      matched: l.matchedEntryIds.map((id) => matchedById.get(id)).filter(Boolean).map((m) => ({ id: m!.id, description: m!.description, signedAmount: signed(m!) })),
      suggestions: suggestions.map((s) => ({ id: s.id, description: s.description, counterparty: s.counterparty, signedAmount: s.signedAmount, date: s.date, open: s.status === 'PREVISTO', score: s.score })),
    }
  })
}

export async function matchLine(tenantId: string, lineId: string, entryIds: string[], actor: Actor): Promise<string | null> {
  const ids = [...new Set(entryIds)].slice(0, 50)
  if (!ids.length) return 'Selecione os lançamentos.'
  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } })
  if (!line) return 'Linha não encontrada.'
  if (line.status !== 'PENDENTE') return 'Esta linha já foi tratada.'
  if ((await reconciledEntryIds(tenantId, ids)).size) return 'Algum lançamento já está conciliado com outra linha.'
  const entries = await prisma.financialEntry.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, type: true, amount: true, status: true, accountId: true, transferGroupId: true, parentEntryId: true } })
  if (entries.length !== ids.length) return 'Lançamento não encontrado.'
  if (entries.some((e) => e.status === 'CANCELADO')) return 'Lançamento cancelado não concilia.'
  if (entries.some((e) => (e.status === 'PAGO' || e.status === 'RECEBIDO') && e.accountId !== line.accountId)) return 'Lançamento realizado em outra conta.'
  if (!sumsMatch(Number(line.amount), entries.map((e) => ({ signedAmount: signed(e) })))) return 'A soma dos lançamentos não bate com o valor do extrato.'
  // Títulos em aberto: baixa na data do extrato e nesta conta.
  for (const e of entries.filter((x) => x.status === 'PREVISTO')) {
    const r = await settleTitle(tenantId, e.id, { paidDate: spYmd(line.date), accountId: line.accountId }, actor)
    if ('error' in r) return `Não foi possível baixar um lançamento: ${r.error}`
  }
  const upd = await prisma.bankStatementLine.updateMany({ where: { id: line.id, status: 'PENDENTE' }, data: { status: 'CONCILIADO', matchedEntryIds: ids, matchedAt: new Date(), matchedById: actor.id } })
  if (upd.count !== 1) return 'Esta linha foi tratada por outra pessoa. Atualize a tela.'
  await audit(actor, tenantId, 'BANK_RECONCILE', line.id, { entryIds: ids, amount: Number(line.amount) })
  return null
}

export async function createFromLine(tenantId: string, lineId: string, input: { categoryId: string | null; description: string | null }, actor: Actor): Promise<string | null> {
  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } })
  if (!line) return 'Linha não encontrada.'
  if (line.status !== 'PENDENTE') return 'Esta linha já foi tratada.'
  const closed = await periodError(tenantId, [line.date])
  if (closed) return closed
  const amount = Number(line.amount)
  const type = amount >= 0 ? 'RECEITA' : 'DESPESA'
  if (input.categoryId) {
    const cat = await prisma.financialCategory.findFirst({ where: { id: input.categoryId, tenantId }, select: { kind: true } })
    if (!cat) return 'Categoria inválida.'
    if (cat.kind !== type) return 'A categoria não é do mesmo tipo do lançamento.'
  }
  const e = await prisma.financialEntry.create({
    data: {
      tenantId, accountId: line.accountId, categoryId: input.categoryId, type, status: type === 'RECEITA' ? 'RECEBIDO' : 'PAGO',
      description: (input.description?.trim() || line.description).slice(0, 240), amount: Math.abs(amount),
      dueDate: line.date, paidDate: line.date, competenceDate: line.date, documentNumber: line.document, source: 'MANUAL',
      notes: 'Criado pela conciliação bancária.', createdById: actor.id,
    },
    select: { id: true },
  })
  await prisma.bankStatementLine.update({ where: { id: line.id }, data: { status: 'CONCILIADO', matchedEntryIds: [e.id], matchedAt: new Date(), matchedById: actor.id } })
  await audit(actor, tenantId, 'BANK_RECONCILE_CREATE', line.id, { entryId: e.id, amount })
  return null
}

export async function setLineStatus(tenantId: string, lineId: string, action: 'IGNORAR' | 'DESFAZER', reason: string | null, actor: Actor): Promise<string | null> {
  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } })
  if (!line) return 'Linha não encontrada.'
  if (action === 'IGNORAR' && line.status !== 'PENDENTE') return 'Só linhas pendentes podem ser ignoradas.'
  if (action === 'DESFAZER' && line.status === 'PENDENTE') return 'Linha já está pendente.'
  await prisma.bankStatementLine.update({ where: { id: line.id }, data: action === 'IGNORAR' ? { status: 'IGNORADO', matchedAt: new Date(), matchedById: actor.id } : { status: 'PENDENTE', matchedEntryIds: [], matchedAt: null, matchedById: null } })
  await audit(actor, tenantId, action === 'IGNORAR' ? 'BANK_LINE_IGNORE' : 'BANK_RECONCILE_UNDO', line.id, { before: { status: line.status, entryIds: line.matchedEntryIds }, reason })
  return null
}

export async function reconciliationSummary(tenantId: string, accountId: string) {
  const g = await prisma.bankStatementLine.groupBy({ by: ['status'], where: { tenantId, accountId }, _count: true, _sum: { amount: true } })
  const of = (s: string) => g.find((x) => x.status === s)
  return {
    pending: of('PENDENTE')?._count ?? 0, reconciled: of('CONCILIADO')?._count ?? 0, ignored: of('IGNORADO')?._count ?? 0,
    pendingAmount: Number(of('PENDENTE')?._sum.amount ?? 0),
  }
}
