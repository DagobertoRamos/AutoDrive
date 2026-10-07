// =============================================================================
// F&I — simulação automática das fichas do site.
//   • runSiteAutoSimulation: pergunta a TODOS os bancos ativos da loja que estão
//     conectados (credencial da loja, conector oficial) e simulam por API — em
//     paralelo, com tempo limite. Banco manual/sem integração fica "aguardando
//     análise". Grava o resultado + histórico na ficha, uma simulação na lista
//     de simulações, a linha do tempo, o lead e avisa a equipe de F&I.
//   • alertStalledSiteSimulations: ficha do site parada sem ninguém mexer →
//     aviso para a equipe de F&I (repete no máximo a cada 12 h).
// Nunca envia proposta ao banco sozinho: envio formal é do operador.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notify } from '@/services/notification.service'
import { canAccessModule } from '@/lib/permissions'
import { isFiAllowed } from '@/lib/finance/fi-permissions'
import { resolveBank } from './gateway/resolve'
import { addTimeline } from './events'
import { internalSummary, isStalled, pickQuote, readResult, statusOf, withHistory, type AutoSimResult, type BankQuote, type PendingBank } from './site-auto-core'

const BANK_TIMEOUT_MS = 15_000
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado')), ms))])
}

/** Usuários da loja que tratam fichas (módulo de financiamento + permissão de enviar ficha). */
export async function fiTeam(tenantId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true, role: true }, take: 300 })
  const out: string[] = []
  const byRole = new Map<string, boolean>()
  for (const u of users) {
    const role = String(u.role)
    if (!byRole.has(role)) byRole.set(role, canAccessModule(role as never, 'financing' as never) && await isFiAllowed(tenantId, 'enviarFicha', role).catch(() => false))
    if (byRole.get(role)) out.push(u.id)
  }
  return out
}

async function notifyTeam(tenantId: string, proposalId: string, title: string, message: string) {
  const ids = await fiTeam(tenantId).catch(() => [])
  await Promise.all(ids.map((userId) => notify({
    userId, tenantId, type: 'INFO', title, message, actionUrl: `/financiamento/fichas/${proposalId}`,
    metadata: { entityType: 'FinanceProposal', entityId: proposalId, module: 'fi', kind: 'site_simulation' },
    channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
  }).catch(() => {})))
}

export async function runSiteAutoSimulation(proposalId: string): Promise<AutoSimResult | null> {
  const p = await prisma.financeProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, tenantId: true, code: true, status: true, leadId: true, proponentId: true, vehicle: true, vehicleValue: true, downPayment: true, amountRequested: true, installments: true, simulationResult: true, proponent: { select: { nomeCompleto: true } } },
  })
  if (!p?.tenantId || p.status === 'CANCELADA') return null
  const tenantId = p.tenantId
  const terms = { vehicleValue: Number(p.vehicleValue ?? 0), downPayment: Number(p.downPayment ?? 0), installments: Number(p.installments ?? 0) }
  const amount = Number(p.amountRequested ?? terms.vehicleValue - terms.downPayment)

  const banks = await prisma.financeBank.findMany({ where: { tenantId, active: true }, select: { id: true, name: true, adapterKey: true }, orderBy: { name: 'asc' } })
  const quotes: BankQuote[] = []
  const pending: PendingBank[] = []
  await Promise.all(banks.map(async (b) => {
    const r = await resolveBank(tenantId, b).catch(() => null)
    if (!r?.live || !r.provider?.capabilities.simulate) { pending.push({ bankId: b.id, bank: b.name, reason: 'MANUAL' }); return }
    try {
      const list = await withTimeout(r.provider.simulate({ vehicleValue: terms.vehicleValue, downPayment: terms.downPayment, amount, installments: terms.installments, vehicle: p.vehicle ? { description: p.vehicle } : null }, r.ctx), BANK_TIMEOUT_MS)
      const q = pickQuote(list ?? [], terms.installments)
      if (q) quotes.push({ bankId: b.id, bank: b.name, installments: q.installments, installmentValue: q.installmentValue, rateMonthly: q.rateMonthly ?? null, cetMonthly: q.cetMonthly ?? null })
      else pending.push({ bankId: b.id, bank: b.name, reason: 'ERRO' })
    } catch (e) {
      console.error('[fi/site-auto] simulação no banco falhou', { bank: b.name, proposalId, err: e instanceof Error ? e.message : e })
      pending.push({ bankId: b.id, bank: b.name, reason: 'ERRO' })
    }
  }))
  quotes.sort((a, b) => a.installmentValue - b.installmentValue)

  const result = withHistory(p.simulationResult, { status: statusOf(quotes.length, pending.length), at: new Date().toISOString(), terms, quotes, pending })
  const summary = internalSummary(result)

  await prisma.$transaction(async (tx) => {
    await tx.financeProposal.update({ where: { id: p.id }, data: { simulationResult: json(result), ...(quotes[0] ? { monthlyPayment: quotes[0].installmentValue } : {}) } })
    // Lista de simulações do F&I: uma por rodada, com a resposta de cada banco.
    await tx.financeSimulation.create({
      data: {
        tenantId, proponentId: p.proponentId, vehicle: p.vehicle, vehicleValue: terms.vehicleValue, downPayment: terms.downPayment, financedAmount: amount,
        installments: terms.installments, notes: `Site · ficha ${p.code ?? ''}`.trim(),
        options: { create: [
          ...quotes.map((q) => ({ bankId: q.bankId, installments: q.installments, installmentValue: q.installmentValue, rate: q.rateMonthly, cet: q.cetMonthly, status: 'RESPONDIDO' })),
          ...pending.map((b) => ({ bankId: b.bankId, installments: terms.installments, status: b.reason === 'ERRO' ? 'ERRO' : 'AGUARDANDO_ANALISE' })),
        ] },
      },
    })
    await addTimeline(tx, { tenantId, proposalId: p.id, type: 'SYSTEM', source: 'SISTEMA', message: summary, data: { status: result.status, quotes: quotes.length, pending: pending.length } })
  })

  // Lead: cada simulação fica na linha do tempo, com a resposta dos bancos.
  if (p.leadId) {
    await prisma.crmLeadInteraction.create({ data: { tenantId, leadId: p.leadId, type: 'FINANCING', channel: 'F&I', summary: summary.slice(0, 2000), authorId: 'system', authorName: 'F&I automático', occurredAt: new Date() } }).catch(() => {})
  }

  const who = p.proponent?.nomeCompleto ?? 'Cliente'
  const cond = `${brl(terms.vehicleValue)}, entrada ${brl(terms.downPayment)}, ${terms.installments}x`
  if (result.status === 'AGUARDANDO_ANALISE') {
    await notifyTeam(tenantId, p.id, 'Simulação do site aguardando análise', `${p.code ?? ''} · ${who} · ${cond}. Nenhum banco respondeu automaticamente.`)
  } else if (result.status === 'PARCIAL') {
    await notifyTeam(tenantId, p.id, 'Simulação do site: faltam bancos', `${p.code ?? ''} · ${who} · ${quotes.length} banco(s) responderam; ${pending.length} aguardando análise manual.`)
  } else {
    await notifyTeam(tenantId, p.id, 'Simulação do site respondida pelos bancos', `${p.code ?? ''} · ${who} · melhor parcela ${brl(quotes[0].installmentValue)}.`)
  }
  return result
}

/** Fichas do site paradas (sem envio aos bancos) → aviso à equipe de F&I. */
export async function alertStalledSiteSimulations(now = new Date()): Promise<number> {
  const rows = await prisma.financeProposal.findMany({
    where: { origin: 'SITE', status: { in: ['SIMULACAO', 'PREENCHENDO'] }, updatedAt: { lt: new Date(now.getTime() - 30 * 60_000), gte: new Date(now.getTime() - 15 * 86_400_000) } },
    select: { id: true, tenantId: true, code: true, status: true, updatedAt: true, originMeta: true, simulationResult: true, proponent: { select: { nomeCompleto: true } }, submissions: { where: { active: true }, select: { id: true }, take: 1 } },
    take: 200,
  })
  let sent = 0
  for (const r of rows) {
    if (!r.tenantId) continue
    const meta = (r.originMeta && typeof r.originMeta === 'object' && !Array.isArray(r.originMeta) ? r.originMeta : {}) as Record<string, unknown>
    if (!isStalled({ status: r.status, hasActiveSubmission: r.submissions.length > 0, updatedAt: r.updatedAt, lastAlertAt: typeof meta.stalledAlertAt === 'string' ? meta.stalledAlertAt : null }, now)) continue
    const sim = readResult(r.simulationResult)
    const why = sim?.status === 'PARCIAL' ? 'faltam bancos responder' : 'sem envio aos bancos'
    await notifyTeam(r.tenantId, r.id, 'Simulação do site parada', `${r.code ?? ''} · ${r.proponent?.nomeCompleto ?? 'Cliente'} — ${why}. Envie a ficha ou registre a resposta.`)
    await prisma.financeProposal.update({ where: { id: r.id }, data: { originMeta: json({ ...meta, stalledAlertAt: now.toISOString() }) } }).catch(() => {})
    sent++
  }
  return sent
}

/** Guarda o hash do link anterior (até 5) para não quebrar o link que o cliente já recebeu. */
export async function keepPreviousPortalLink(proposalId: string, hash: string, originMeta: unknown) {
  const meta = (originMeta && typeof originMeta === 'object' && !Array.isArray(originMeta) ? originMeta : {}) as Record<string, unknown>
  const list = Array.isArray(meta.portalTokenHashes) ? (meta.portalTokenHashes as string[]) : []
  if (list.includes(hash)) return
  await prisma.financeProposal.update({ where: { id: proposalId }, data: { originMeta: { ...meta, portalTokenHashes: [...list, hash].slice(-5) } as Prisma.InputJsonValue } }).catch(() => {})
}
